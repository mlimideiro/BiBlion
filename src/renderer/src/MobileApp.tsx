import { useState, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import axios from 'axios'
import Tesseract from 'tesseract.js'
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

interface BookMetadata {
    isbn: string
    title: string
    authors: string[]
    publisher?: string
    pageCount?: number
    description?: string
    coverUrl?: string
    status: 'loading' | 'ready' | 'error'
}

function MobileApp() {
    const [mode, setMode] = useState<'idle' | 'scanning' | 'cropping' | 'processing' | 'result'>('idle')
    const [isBurstMode, setIsBurstMode] = useState(false)
    const [log, setLog] = useState<string[]>(['Listo.'])
    const [pendingBooks, setPendingBooks] = useState<BookMetadata[]>([])
    const [manualIsbn, setManualIsbn] = useState('')
    const scannerRef = useRef<Html5Qrcode | null>(null)
    const lastScannedIsbn = useRef<string | null>(null)
    const scanTimeout = useRef<any>(null)
    const sessionIsbns = useRef<Set<string>>(new Set())

    // Cropping states
    const [imgSrc, setImgSrc] = useState('')
    const imgRef = useRef<HTMLImageElement>(null)
    const [crop, setCrop] = useState<Crop>()
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>()

    const addLog = (msg: string) => setLog(prev => [...prev.slice(-4), msg])

    const startScanner = async (burst: boolean) => {
        setIsBurstMode(burst)
        setMode('scanning')
        addLog('Iniciando cámara...')

        if (!window.isSecureContext && window.location.hostname !== 'localhost') {
            addLog('⚠️ Alerta: Cámara requiere HTTPS o ajuste "flags" en Chrome.')
        }

        await new Promise(r => setTimeout(r, 200))

        try {
            if (!document.getElementById('reader')) {
                throw new Error('No se encontró el contenedor de video')
            }

            if (scannerRef.current) {
                try { await scannerRef.current.stop(); } catch (e) { }
                scannerRef.current.clear()
            }

            const scanner = new Html5Qrcode("reader")
            scannerRef.current = scanner

            await scanner.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 150 } },
                (decodedText) => {
                    const cleanIsbn = decodedText.replace(/-/g, '')
                    if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
                        // Prevent repetitive scans of the same ISBN too quickly
                        if (cleanIsbn === lastScannedIsbn.current) return

                        lastScannedIsbn.current = cleanIsbn
                        if (scanTimeout.current) clearTimeout(scanTimeout.current)
                        scanTimeout.current = setTimeout(() => { lastScannedIsbn.current = null }, 3000)

                        addLog(`¡Leído! ${cleanIsbn}`)

                        if (!burst) {
                            scanner.stop().then(() => {
                                scanner.clear()
                                handleLookup(cleanIsbn, burst)
                            }).catch(console.error)
                        } else {
                            // In Burst Mode, just add to queue and keep scanning
                            handleLookup(cleanIsbn, burst)
                        }
                    }
                },
                (_errorMessage) => { }
            )
            addLog(burst ? 'Modo Ráfaga activo. Escanea varios libros.' : 'Cámara activa. Apunta al código de barras.')
        } catch (err: any) {
            addLog('Error cámara: ' + err.message)
            setMode('idle')
        }
    }

    const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setCrop(undefined)
            const reader = new FileReader()
            reader.addEventListener('load', () =>
                setImgSrc(reader.result?.toString() || ''),
            )
            reader.readAsDataURL(e.target.files[0])
            setMode('cropping')
        }
    }

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height } = e.currentTarget
        // For free-form crop without aspect ratio, we can just pass 1 (or any number) and use it as a placeholder if the library requires it
        // Or better, use Percentage crop directly
        const initialCrop = centerCrop(
            makeAspectCrop(
                {
                    unit: '%',
                    width: 90,
                },
                1, // Default aspect if needed, but we wanted free-form. 
                width,
                height,
            ),
            width,
            height,
        )
        // Adjust the crop to be free-form after creation
        setCrop(initialCrop)
    }

    const handleCropComplete = async () => {
        if (!completedCrop || !imgRef.current) return

        setMode('processing')
        addLog('Extrayendo texto...')

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const scaleX = imgRef.current.naturalWidth / imgRef.current.width
        const scaleY = imgRef.current.naturalHeight / imgRef.current.height

        canvas.width = completedCrop.width * scaleX
        canvas.height = completedCrop.height * scaleY

        ctx.drawImage(
            imgRef.current,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
        )

        canvas.toBlob(async (blob) => {
            if (!blob) return
            try {
                const result = await Tesseract.recognize(
                    blob,
                    'eng',
                    { logger: m => console.log(m) }
                )

                const text = result.data.text
                addLog('Buscando números...')

                const numbers = text.replace(/[^0-9X\n ]/gi, '')
                const candidates = numbers.match(/(?:97[89][-\s]?)?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,6}[-\s]?\d{1}/g)

                let foundIsbn = null
                if (candidates) {
                    for (const candle of candidates) {
                        const clean = candle.replace(/[-\s]/g, '')
                        if (clean.length === 10 || clean.length === 13) {
                            foundIsbn = clean
                            break
                        }
                    }
                }

                if (foundIsbn) {
                    addLog(`Detectado: ${foundIsbn}`)
                    handleLookup(foundIsbn, false)
                } else {
                    addLog('No se encontró un ISBN válido en el recorte.')
                    setMode('idle')
                }
            } catch (err: any) {
                addLog('Error OCR: ' + err.message)
                setMode('idle')
            }
        }, 'image/jpeg')
    }

    const handleManualSubmit = () => {
        const clean = manualIsbn.replace(/-/g, '').trim()
        if (clean.length < 10) {
            addLog('ISBN muy corto.')
            return
        }
        handleLookup(clean, isBurstMode)
    }

    const handleLookup = async (isbn: string, isBurst: boolean) => {
        if (!isBurst) {
            setMode('processing')
        }

        if (sessionIsbns.current.has(isbn)) {
            addLog(`Ya procesando ${isbn}`)
            return
        }

        sessionIsbns.current.add(isbn)

        const newPending: BookMetadata = {
            isbn,
            title: 'Buscando...',
            authors: [],
            status: 'loading'
        }

        setPendingBooks(prev => [newPending, ...prev])
        addLog(`Buscando ${isbn}...`)

        try {
            const res = await axios.get(`/api/lookup/${isbn}`)
            setPendingBooks(prev => prev.map(b =>
                b.isbn === isbn ? { ...res.data, isbn, status: 'ready' } : b
            ))

            if (!isBurst) {
                setMode('result')
            }
        } catch (err) {
            addLog(`Error en ${isbn}`)
            setPendingBooks(prev => prev.map(b =>
                b.isbn === isbn ? { ...b, title: 'No encontrado', status: 'error' } : b
            ))
            if (!isBurst) {
                setMode('idle')
            }
        }
    }

    const removeItem = (isbn: string) => {
        setPendingBooks(prev => prev.filter(b => b.isbn !== isbn))
        // We don't remove from sessionIsbns to avoid re-scanning the same mistake immediately 
        // until the app is reset or the user stops/starts
    }

    const handleConfirm = async () => {
        const readyBooks = pendingBooks.filter(b => b.status === 'ready')
        if (readyBooks.length === 0) return

        addLog(`Guardando ${readyBooks.length} libros...`)
        setMode('processing')

        try {
            for (const book of readyBooks) {
                await axios.post('/api/save', book)
            }
            addLog('¡Todo guardado!')
            setTimeout(() => {
                setPendingBooks([])
                sessionIsbns.current.clear() // Clear for a fresh new scan session
                setManualIsbn('')
                setMode('idle')
            }, 2000)
        } catch (err) {
            addLog('Falló el guardado masivo.')
            setMode('result')
        }
    }

    return (
        <div style={{ padding: 15, background: '#1a1a1a', minHeight: '100vh', color: '#eee', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ textAlign: 'center', marginBottom: 20 }}>BiBlion Móvil</h1>

            <div style={{ background: '#000', color: '#0f0', padding: 10, borderRadius: 5, marginBottom: 20, fontSize: '0.9rem', minHeight: 60 }}>
                {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>

            {mode === 'idle' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <button
                            onClick={() => startScanner(false)}
                            style={{ padding: 20, fontSize: '1.1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 12, fontWeight: 'bold' }}>
                            📷 Uno solo
                        </button>
                        <button
                            onClick={() => startScanner(true)}
                            style={{ padding: 20, fontSize: '1.1rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 12, fontWeight: 'bold' }}>
                            🚀 Ráfaga
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <label style={{
                            padding: 15, background: '#8b5cf6', color: 'white', borderRadius: 12, fontWeight: 'bold', textAlign: 'center', cursor: 'pointer'
                        }}>
                            📸 Foto ISBN
                            <input type="file" accept="image/*" capture="environment" onChange={onSelectFile} style={{ display: 'none' }} />
                        </label>
                        <label style={{
                            padding: 15, background: '#a855f7', color: 'white', borderRadius: 12, fontWeight: 'bold', textAlign: 'center', cursor: 'pointer'
                        }}>
                            🖼️ Galería
                            <input type="file" accept="image/*" onChange={onSelectFile} style={{ display: 'none' }} />
                        </label>
                    </div>

                    <div style={{ background: '#333', padding: 15, borderRadius: 12 }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <input
                                type="number"
                                value={manualIsbn}
                                onChange={(e) => setManualIsbn(e.target.value)}
                                placeholder="ISBN manual..."
                                style={{ flex: 1, padding: 10, borderRadius: 6, border: 'none', background: '#222', color: 'white' }}
                            />
                            <button onClick={handleManualSubmit} style={{ padding: '10px 20px', background: '#555', color: 'white', border: 'none', borderRadius: 6 }}>
                                🔍
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {mode === 'cropping' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <p style={{ textAlign: 'center', margin: '0 0 10px 0' }}>Encuadra el número ISBN:</p>
                    <div style={{ flex: 1, overflow: 'auto', background: '#000', borderRadius: 8 }}>
                        <ReactCrop
                            crop={crop}
                            onChange={(c) => setCrop(c)}
                            onComplete={(c) => setCompletedCrop(c)}
                        >
                            <img ref={imgRef} src={imgSrc} onLoad={onImageLoad} style={{ maxWidth: '100%' }} />
                        </ReactCrop>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
                        <button
                            onClick={handleCropComplete}
                            style={{ flex: 1, padding: 15, background: '#22c55e', color: 'white', border: 'none', borderRadius: 12, fontWeight: 'bold' }}>
                            ✅ Confirmar
                        </button>
                        <button
                            onClick={() => setMode('idle')}
                            style={{ flex: 1, padding: 15, background: '#4b5563', color: 'white', border: 'none', borderRadius: 12 }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {mode === 'scanning' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div id="reader" style={{ width: '100%', background: '#000', borderRadius: 8, overflow: 'hidden', flex: 1 }}></div>

                    {isBurstMode && pendingBooks.length > 0 && (
                        <div style={{ marginTop: 10, maxHeight: 150, overflowY: 'auto', background: '#222', borderRadius: 8, padding: 5 }}>
                            {pendingBooks.map(b => (
                                <div key={b.isbn} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', borderBottom: '1px solid #333', fontSize: '0.8rem' }}>
                                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {b.status === 'loading' ? '⌛' : '✅'} {b.title}
                                    </span>
                                    <button onClick={() => removeItem(b.isbn)} style={{ background: 'none', border: 'none', color: '#ff4444' }}>✕</button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
                        {isBurstMode && pendingBooks.length > 0 && (
                            <button
                                onClick={() => {
                                    if (scannerRef.current) scannerRef.current.stop().then(() => setMode('result'))
                                }}
                                style={{ flex: 1, padding: 15, background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold' }}>
                                Revisar ({pendingBooks.length})
                            </button>
                        )}
                        <button onClick={(() => {
                            if (scannerRef.current) scannerRef.current.stop().then(() => setMode('idle'))
                            else setMode('idle')
                        })} style={{ flex: 1, padding: 15, background: '#ef4444', color: 'white', border: 'none', borderRadius: 8 }}>
                            Detener
                        </button>
                    </div>
                </div>
            )}

            {mode === 'processing' && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <div className="spinner" style={{ fontSize: '3rem', marginBottom: 20 }}>🔄</div>
                    <p>Procesando...</p>
                </div>
            )}

            {mode === 'result' && pendingBooks.length > 0 && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 15 }}>
                    <h3 style={{ margin: 0 }}>Confirmar Libros ({pendingBooks.filter(b => b.status === 'ready').length})</h3>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {pendingBooks.map(b => (
                            <div key={b.isbn} style={{ background: '#333', padding: 10, borderRadius: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                                {b.coverUrl ? (
                                    <img src={b.coverUrl} style={{ width: 40, height: 60, objectFit: 'cover', borderRadius: 4 }} />
                                ) : (
                                    <div style={{ width: 40, height: 60, background: '#222', borderRadius: 4 }} />
                                )}
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#aaa' }}>{b.isbn}</div>
                                </div>
                                <button onClick={() => removeItem(b.isbn)} style={{ padding: 10, background: '#444', border: 'none', borderRadius: '50%', color: '#ff4444', width: 35, height: 35, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            onClick={handleConfirm}
                            disabled={pendingBooks.filter(b => b.status === 'ready').length === 0}
                            style={{ flex: 1, padding: 15, background: '#22c55e', color: 'white', border: 'none', borderRadius: 12, fontWeight: 'bold', opacity: pendingBooks.filter(b => b.status === 'ready').length === 0 ? 0.5 : 1 }}>
                            Guardar Todo
                        </button>
                        <button onClick={() => setMode('idle')} style={{ flex: 1, padding: 15, background: '#4b5563', color: 'white', border: 'none', borderRadius: 12 }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default MobileApp
