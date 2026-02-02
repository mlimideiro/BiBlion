import { useState, useRef, useEffect } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import axios from 'axios'
import Tesseract from 'tesseract.js'
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import './mobile.css'
import { ScanBarcode, Library, Image as ImageIcon, Camera, Search, ChevronRight, X, Sparkles, User } from 'lucide-react'
import logo from './assets/logo.png'
import { LibraryView } from './components/LibraryView'
import { Book, Config } from './types'
import { dataService } from './services/dataService'
import { Login } from './components/Login'
import { LoansModal } from './components/LoansModal'
import { HandHelping } from 'lucide-react'

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

type StatusType = 'idle' | 'success' | 'processing' | 'error' | 'warning'

const MobileApp: React.FC = () => {
    // Mode management
    const [mode, setMode] = useState<'idle' | 'scanning' | 'cropping' | 'processing' | 'result' | 'library'>('idle')
    const [currentUser, setCurrentUser] = useState<string | null>(localStorage.getItem('biblion_user'))
    const [isLoggedIn, setIsLoggedIn] = useState(!!currentUser)
    const [books, setBooks] = useState<Book[]>([])
    const [config, setConfig] = useState<Config | null>(null)
    const [isBurstMode, setIsBurstMode] = useState(false)
    const [status, setStatus] = useState<{ msg: string; type: StatusType }>({ msg: 'Listo para escaneo', type: 'idle' })
    const [pendingBooks, setPendingBooks] = useState<BookMetadata[]>([])
    const [manualIsbn, setManualIsbn] = useState('')
    const [loansOpen, setLoansOpen] = useState(false)
    const scannerRef = useRef<Html5Qrcode | null>(null)
    const lastScannedIsbn = useRef<string | null>(null)
    const scanTimeout = useRef<any>(null)
    const sessionIsbns = useRef<Set<string>>(new Set())

    // Cropping states
    const [imgSrc, setImgSrc] = useState('')
    const imgRef = useRef<HTMLImageElement>(null)
    const [crop, setCrop] = useState<Crop>()
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>()

    // Camera capabilities
    const [capabilities, setCapabilities] = useState<any>(null)
    const [torchOn, setTorchOn] = useState(false)
    const [zoom, setZoom] = useState(1)

    useEffect(() => {
        if ((mode === 'library' || mode === 'idle') && currentUser) {
            dataService.getBooks(currentUser).then(setBooks)
            dataService.getConfig(currentUser).then(setConfig)
        }
    }, [mode, currentUser])

    const updateStatus = (msg: string, type: StatusType = 'processing') => {
        setStatus({ msg, type })
    }

    const startScanner = async (burst: boolean) => {
        setIsBurstMode(burst)
        setMode('scanning')
        updateStatus('Iniciando cámara...', 'processing')

        if (!window.isSecureContext && window.location.hostname !== 'localhost') {
            updateStatus('⚠️ Requiere HTTPS para cámara', 'warning')
        }

        await new Promise(r => setTimeout(r, 200))

        try {
            if (!document.getElementById('reader')) {
                throw new Error('Contenedor no hallado')
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
                        if (cleanIsbn === lastScannedIsbn.current) return

                        lastScannedIsbn.current = cleanIsbn
                        if (scanTimeout.current) clearTimeout(scanTimeout.current)
                        scanTimeout.current = setTimeout(() => { lastScannedIsbn.current = null }, 3000)

                        updateStatus(`¡Leído! ${cleanIsbn}`, 'success')

                        if (!burst) {
                            scanner.stop().then(() => {
                                scanner.clear()
                                handleLookup(cleanIsbn, burst)
                            }).catch(console.error)
                        } else {
                            handleLookup(cleanIsbn, burst)
                        }
                    }
                },
                (_errorMessage) => { }
            )

            // Try to get capabilities after start
            try {
                const caps = scanner.getRunningTrackCapabilities()
                console.log('[MobileApp] Camera capabilities:', caps)
                setCapabilities(caps)
                // Set initial zoom
                if ((caps as any).zoom) setZoom((caps as any).zoom.min || 1)
            } catch (e) {
                console.warn('[MobileApp] Could not get capabilities:', e)
            }

            updateStatus(burst ? 'Modo Ráfaga: Escanea varios' : 'Apunta al código de barras', 'idle')
        } catch (err: any) {
            updateStatus('Error cámara: ' + err.message, 'error')
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
        const initialCrop = centerCrop(
            makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
            width, height
        )
        setCrop(initialCrop)
    }

    const handleCropComplete = async () => {
        if (!completedCrop || !imgRef.current) return

        setMode('processing')
        updateStatus('Extrayendo texto...', 'processing')

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const scaleX = imgRef.current.naturalWidth / imgRef.current.width
        const scaleY = imgRef.current.naturalHeight / imgRef.current.height

        canvas.width = completedCrop.width * scaleX
        canvas.height = completedCrop.height * scaleY

        ctx.drawImage(
            imgRef.current,
            completedCrop.x * scaleX, completedCrop.y * scaleY,
            completedCrop.width * scaleX, completedCrop.height * scaleY,
            0, 0,
            completedCrop.width * scaleX, completedCrop.height * scaleY
        )

        canvas.toBlob(async (blob) => {
            if (!blob) return
            try {
                const result = await Tesseract.recognize(blob, 'eng')
                const text = result.data.text
                updateStatus('Buscando números...', 'processing')

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
                    updateStatus(`Detectado: ${foundIsbn}`, 'success')
                    handleLookup(foundIsbn, false)
                } else {
                    updateStatus('ISBN no hallado', 'error')
                    setMode('idle')
                }
            } catch (err: any) {
                updateStatus('Error OCR: ' + err.message, 'error')
                setMode('idle')
            }
        }, 'image/jpeg')
    }

    const handleManualSubmit = () => {
        const clean = manualIsbn.replace(/-/g, '').trim()
        if (clean.length < 10) {
            updateStatus('ISBN muy corto', 'warning')
            return
        }
        handleLookup(clean, isBurstMode)
    }

    const handleLookup = async (isbn: string, isBurst: boolean) => {
        const normalized = isbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
        if (!isBurst) setMode('processing')

        if (sessionIsbns.current.has(normalized)) {
            updateStatus(`Ya en cola: ${normalized}`, 'warning')
            return
        }

        sessionIsbns.current.add(normalized)
        const currentIsbn = normalized
        const newPending: BookMetadata = {
            isbn: currentIsbn, title: 'Buscando...', authors: [], status: 'loading'
        }

        setPendingBooks(prev => [newPending, ...prev])
        updateStatus(`Buscando ${isbn}...`, 'processing')

        try {
            const res = await axios.get(`/api/lookup/${isbn}`)
            setPendingBooks(prev => prev.map(b =>
                b.isbn === currentIsbn ? { ...res.data, isbn: currentIsbn, status: 'ready' } : b
            ))
            updateStatus(`¡Listo! ${isbn}`, 'success')
            if (!isBurst) setMode('result')
        } catch (err) {
            updateStatus(`No se encontró metadata para ${isbn}`, 'warning')
            setPendingBooks(prev => prev.map(b =>
                b.isbn === currentIsbn ? { ...b, title: '', status: 'error' } : b
            ))
            if (!isBurst) setMode('result') // Go to result anyway to allow manual entry
        }
    }

    const removeItem = (isbn: string) => {
        setPendingBooks(prev => prev.filter(b => b.isbn !== isbn))
    }

    const handleConfirm = async () => {
        const booksToSave = pendingBooks.filter(b => b.status === 'ready' || (b.status === 'error' && b.title.trim() !== ''))
        if (booksToSave.length === 0) {
            updateStatus('Agregue un título a los fallidos', 'warning')
            return
        }

        updateStatus(`Guardando ${booksToSave.length} libros...`, 'processing')
        setMode('processing')

        try {
            for (const book of booksToSave) {
                // Use dataService to ensure consistent behavior with username
                // Convert BookMetadata to Book (omitting the internal 'status' field)
                const { status: _metaStatus, ...bookData } = book as any
                await dataService.saveBook({
                    ...bookData,
                    status: 'available'
                } as Book, currentUser || undefined)
            }
            updateStatus('¡Todo guardado!', 'success')
            setTimeout(() => {
                setPendingBooks([])
                sessionIsbns.current.clear()
                setManualIsbn('')
                setMode('idle')
                updateStatus('Listo para escaneo', 'idle')
            }, 2000)
        } catch (err) {
            updateStatus('Error al guardar', 'error')
            setMode('result')
        }
    }

    const handleLoansSaveBook = async (book: Book) => {
        if (!currentUser) return
        try {
            await dataService.saveBook(book, currentUser)
            // Refresh books list
            const updated = await dataService.getBooks(currentUser)
            setBooks(updated)
        } catch (e) {
            console.error("Error saving loan status", e)
        }
    }

    const toggleTorch = async () => {
        if (!scannerRef.current || !capabilities?.torch) return
        const newState = !torchOn
        try {
            await scannerRef.current.applyVideoConstraints({
                advanced: [{ torch: newState }] as any
            })
            setTorchOn(newState)
        } catch (e) {
            console.error('Error toggling torch:', e)
        }
    }

    const handleZoomChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value)
        setZoom(value)
        if (!scannerRef.current || !capabilities?.zoom) return
        try {
            await scannerRef.current.applyVideoConstraints({
                advanced: [{ zoom: value }] as any
            })
        } catch (e) {
            console.error('Error applying zoom:', e)
        }
    }

    const stopScanning = () => {
        if (scannerRef.current) {
            scannerRef.current.stop().then(() => {
                setMode('idle')
                setCapabilities(null)
                setTorchOn(false)
                updateStatus('Listo para escaneo', 'idle')
            }).catch(() => {
                setMode('idle')
                setCapabilities(null)
                setTorchOn(false)
            })
        } else {
            setMode('idle')
        }
    }

    if (!isLoggedIn) {
        return <Login onLogin={(user) => {
            setCurrentUser(user)
            setIsLoggedIn(true)
        }} />
    }

    return (
        <div className="mobile-app">
            <div className={`status-bar ${status.type}`}>
                {status.msg}
            </div>

            <header className="mobile-header" onClick={() => setMode('idle')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <img src={logo} alt="BiBlion" style={{ width: '50px', height: '50px' }} />
                    <h1>BiBlion Móvil</h1>
                </div>
            </header>

            {currentUser && mode === 'idle' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#cdd6f4', marginTop: '8px', marginBottom: '-5px' }}>
                    <User size={24} />
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', lineHeight: '1' }}>{currentUser}</span>
                </div>
            )}

            <main className="mobile-content">
                {mode === 'library' && (
                    <LibraryView
                        books={books}
                        config={config}
                        onUpdateBooks={setBooks}
                        onUpdateConfig={setConfig}
                        isMobile={true}
                        onBack={() => setMode('idle')}
                        currentUser={currentUser}
                    />
                )}

                {mode === 'idle' && (
                    <div className="mobile-idle-container">
                        <button className="menu-card" onClick={() => startScanner(false)}>
                            <div className="menu-card-icon">
                                <ScanBarcode size={40} strokeWidth={1.5} />
                            </div>
                            <div className="menu-card-content">
                                <span className="menu-card-title">Escanear un libro</span>
                                <span className="menu-card-subtitle">Escanea ISBN de un solo libro</span>
                            </div>
                            <div className="menu-card-chevron">
                                <ChevronRight size={24} />
                            </div>
                        </button>

                        <button className="menu-card" onClick={() => startScanner(true)}>
                            <div className="menu-card-icon">
                                <Sparkles size={40} strokeWidth={1.5} />
                            </div>
                            <div className="menu-card-content">
                                <span className="menu-card-title">Escanear varios libros</span>
                                <span className="menu-card-subtitle">Escanea ISBN de varios libros </span>
                            </div>
                            <div className="menu-card-chevron">
                                <ChevronRight size={24} />
                            </div>
                        </button>

                        <label className="menu-card">
                            <input type="file" accept="image/*" capture="environment" onChange={onSelectFile} style={{ display: 'none' }} />
                            <div className="menu-card-icon">
                                <Camera size={40} strokeWidth={1.5} />
                            </div>
                            <div className="menu-card-content">
                                <span className="menu-card-title">Foto ISBN</span>
                                <span className="menu-card-subtitle">Escanea ISBN desde la cámara</span>
                            </div>
                            <div className="menu-card-chevron">
                                <ChevronRight size={24} />
                            </div>
                        </label>

                        <label className="menu-card">
                            <input type="file" accept="image/*" onChange={onSelectFile} style={{ display: 'none' }} />
                            <div className="menu-card-icon">
                                <ImageIcon size={40} strokeWidth={1.5} />
                            </div>
                            <div className="menu-card-content">
                                <span className="menu-card-title">Desde galería</span>
                                <span className="menu-card-subtitle">Detecta ISBN desde una foto</span>
                            </div>
                            <div className="menu-card-chevron">
                                <ChevronRight size={24} />
                            </div>
                        </label>

                        <div className="manual-input-container" style={{ marginTop: 10 }}>
                            <input
                                type="number"
                                value={manualIsbn}
                                onChange={(e) => setManualIsbn(e.target.value)}
                                placeholder="Ingresar ISBN manualmente"
                            />
                            <button onClick={handleManualSubmit} className="search-btn">
                                <Search size={22} />
                            </button>
                        </div>

                        <button className="menu-card" onClick={() => setMode('library')}>
                            <div className="menu-card-icon">
                                <Library size={40} strokeWidth={1.5} />
                            </div>
                            <div className="menu-card-content">
                                <span className="menu-card-title">Ver BiBlion</span>
                                <span className="menu-card-subtitle">{books.length} Libritos guardados</span>
                            </div>
                            <div className="menu-card-chevron">
                                <ChevronRight size={24} />
                            </div>
                        </button>

                        <button className="menu-card" onClick={() => setLoansOpen(true)} style={{ borderLeft: '4px solid var(--mobile-accent)' }}>
                            <div className="menu-card-icon">
                                <HandHelping size={40} strokeWidth={1.5} color="var(--mobile-accent)" />
                            </div>
                            <div className="menu-card-content">
                                <span className="menu-card-title">Préstamos</span>
                                <span className="menu-card-subtitle">Gestionar libros prestados</span>
                            </div>
                            <div className="menu-card-chevron">
                                <HandHelping size={24} />
                            </div>
                        </button>
                    </div>
                )}

                {mode === 'cropping' && (
                    <div className="full-screen-container">
                        <div style={{ padding: 15, textAlign: 'center', fontSize: '0.9rem', color: '#888' }}>
                            Encuadra el número ISBN
                        </div>
                        <ReactCrop
                            crop={crop}
                            onChange={(c) => setCrop(c)}
                            onComplete={(c) => setCompletedCrop(c)}
                        >
                            <img ref={imgRef} src={imgSrc} onLoad={onImageLoad} style={{ width: '100%' }} />
                        </ReactCrop>
                    </div>
                )}

                {mode === 'scanning' && (
                    <div className="full-screen-container">
                        <div id="reader"></div>
                        <div className="scanner-controls">
                            {capabilities?.torch && (
                                <button
                                    className={`control-btn ${torchOn ? 'active' : ''}`}
                                    onClick={toggleTorch}
                                >
                                    {torchOn ? '🔦 On' : '🔦 Off'}
                                </button>
                            )}
                            {capabilities?.zoom && capabilities.zoom.max > capabilities.zoom.min && (
                                <div className="zoom-control">
                                    <span>Zoom</span>
                                    <input
                                        type="range"
                                        min={capabilities.zoom.min}
                                        max={capabilities.zoom.max}
                                        step={0.1}
                                        value={zoom}
                                        onChange={handleZoomChange}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {mode === 'processing' && (
                    <div style={{ textAlign: 'center', marginTop: 100 }}>
                        <div style={{ fontSize: '3rem', animation: 'spin 2s linear infinite' }}>🔄</div>
                        <p style={{ marginTop: 20, fontSize: '1.2rem', color: '#888' }}>Trabajando...</p>
                        <style>{`@keyframes spin { 100% { transform:rotate(360deg); } }`}</style>
                    </div>
                )}

                {mode === 'result' && pendingBooks.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {pendingBooks.map(b => (
                            <div key={b.isbn} className="book-card-mobile">
                                {b.coverUrl ? (
                                    <img src={b.coverUrl} style={{ width: 45, height: 65, objectFit: 'cover', borderRadius: 4 }} />
                                ) : (
                                    <div style={{ width: 45, height: 65, background: '#333', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}>Sin Tapa</div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {b.status === 'error' ? (
                                        <input
                                            placeholder="Ingresar título a mano..."
                                            value={b.title}
                                            onChange={(e) => {
                                                const newTitle = e.target.value
                                                setPendingBooks(prev => prev.map(p =>
                                                    p.isbn === b.isbn ? { ...p, title: newTitle } : p
                                                ))
                                            }}
                                            style={{
                                                width: '100%',
                                                background: '#444',
                                                border: '1px solid var(--mobile-warning)',
                                                borderRadius: 4,
                                                padding: '4px 8px',
                                                color: '#fff',
                                                fontSize: '0.9rem'
                                            }}
                                        />
                                    ) : (
                                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
                                    )}
                                    <div style={{ fontSize: '0.8rem', color: '#888' }}>{b.isbn}</div>
                                </div>
                                <button onClick={() => removeItem(b.isbn)} style={{ background: 'none', border: 'none', color: '#ff4444', padding: 10 }}>
                                    <X size={20} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Sticky Footer for Actions */}
            {
                (mode === 'scanning' || mode === 'cropping' || mode === 'result' && pendingBooks.length > 0) && (
                    <footer className="sticky-footer" style={{ padding: '0 15px' }}>
                        {mode === 'scanning' ? (
                            <>
                                {isBurstMode && pendingBooks.length > 0 && (
                                    <button onClick={() => { scannerRef.current?.stop().then(() => setMode('result')) }} className="mobile-btn btn-success" style={{ flex: 2 }}>
                                        <Sparkles size={18} /> Revisar ({pendingBooks.length})
                                    </button>
                                )}
                                <button onClick={stopScanning} className="mobile-btn btn-danger" style={{ flex: 1 }}>
                                    <X size={18} /> Detener
                                </button>
                            </>
                        ) : mode === 'cropping' ? (
                            <>
                                <button onClick={handleCropComplete} className="mobile-btn btn-success" style={{ flex: 1 }}>
                                    Confirmar
                                </button>
                                <button onClick={() => setMode('idle')} className="mobile-btn btn-secondary" style={{ flex: 1 }}>
                                    Cancelar
                                </button>
                            </>
                        ) : mode === 'result' ? (
                            <>
                                <button onClick={handleConfirm} className="mobile-btn btn-success" style={{ flex: 2 }}>
                                    Guardar Todo
                                </button>
                                <button onClick={() => setMode('idle')} className="mobile-btn btn-secondary" style={{ flex: 1 }}>
                                    Cancelar
                                </button>
                            </>
                        ) : null}
                    </footer>
                )
            }
            {loansOpen && (
                <LoansModal
                    books={books}
                    onSaveBook={handleLoansSaveBook}
                    onClose={() => setLoansOpen(false)}
                />
            )}
        </div >
    )
}

export default MobileApp
