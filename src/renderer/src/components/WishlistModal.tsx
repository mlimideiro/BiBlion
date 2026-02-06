import React, { useState } from 'react'
import { X, Search, Gift, Star, Trash2, CheckCircle2, Plus, RefreshCw, Globe } from 'lucide-react'
import { dataService } from '../services/dataService'
import { Book, Config } from '../types'

interface Props {
    books: Book[]
    config: Config | null
    onSaveBook: (book: Book) => void
    onClose: () => void
    isMobile?: boolean
}

export const WishlistModal: React.FC<Props> = ({ books, config, onSaveBook, onClose, isMobile }) => {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedBook, setSelectedBook] = useState<Book | null>(null)
    const [isConverting, setIsConverting] = useState(false)
    const [targetLibraryId, setTargetLibraryId] = useState('')

    // Prevent body scroll when modal is open
    React.useEffect(() => {
        const originalStyle = window.getComputedStyle(document.body).overflow
        document.body.style.overflow = 'hidden'
        // On some mobile browsers, overflow: hidden on body isn't enough
        document.documentElement.style.overflow = 'hidden'

        return () => {
            document.body.style.overflow = originalStyle
            document.documentElement.style.overflow = 'auto'
        }
    }, [])

    // Prevent body scroll when modal is open
    React.useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = 'unset'
        }
    }, [])

    // States for adding new wishes
    const [isAddingNew, setIsAddingNew] = useState(false)
    const [addQuery, setAddQuery] = useState('')
    const [searchResults, setSearchResults] = useState<Partial<Book>[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [addMethod, setAddMethod] = useState<'search' | 'url' | 'isbn'>('search')

    const normalizeText = (text: string) => {
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    }

    const wishlistBooks = books.filter(b => b.status === 'wishlist').filter(b => {
        if (!searchQuery.trim()) return true
        const q = normalizeText(searchQuery)
        return normalizeText(b.title).includes(q) ||
            (b.authors || []).some(a => normalizeText(a).includes(q))
    })

    const handleUpdateWish = (updates: Partial<Book>) => {
        if (!selectedBook) return
        const updated = { ...selectedBook, ...updates }
        onSaveBook(updated)
        setSelectedBook(updated)
    }

    const handleDeleteWish = (book: Book) => {
        if (confirm(`¿Eliminar "${book.title}" de tu lista de deseos?`)) {
            const updated = { ...book, status: '' as any }
            onSaveBook(updated)
            if (selectedBook?.isbn === book.isbn) setSelectedBook(null)
        }
    }

    const handleConvert = () => {
        if (!selectedBook) return
        const updated = {
            ...selectedBook,
            status: 'available' as const,
            libraryId: targetLibraryId || undefined,
            updatedAt: new Date().toISOString()
        }
        onSaveBook(updated)
        setSelectedBook(null)
        setIsConverting(false)
        alert('¡Genial! El libro ya está en tu biblioteca.')
    }

    const openGoogleSearch = (book: Book) => {
        const query = encodeURIComponent(`${book.title} ${book.authors.join(' ')} libro`)
        window.open(`https://www.google.com/search?q=${query}`, '_blank')
    }

    const handleSearchExternal = async () => {
        if (!addQuery.trim()) return
        setIsSearching(true)
        setSearchResults([])
        try {
            if (addMethod === 'search') {
                const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(addQuery)}&maxResults=10`)
                const data = await res.json()
                const items = data.items || []
                const results: Partial<Book>[] = items.map((item: any) => {
                    const info = item.volumeInfo
                    const isbn = info.industryIdentifiers?.find((id: any) => id.type === 'ISBN_13')?.identifier ||
                        info.industryIdentifiers?.[0]?.identifier ||
                        `WISH-${Math.random().toString(36).substring(7)}`
                    return {
                        isbn,
                        title: info.title,
                        authors: info.authors || ['Desconocido'],
                        publisher: info.publisher,
                        description: info.description,
                        pageCount: info.pageCount,
                        coverUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:') || ''
                    }
                })
                setSearchResults(results)
            } else if (addMethod === 'isbn') {
                const data = await dataService.repairMetadata(addQuery)
                if (data) setSearchResults([{ ...data, isbn: addQuery }])
                else alert('No se encontró información para ese ISBN')
            } else if (addMethod === 'url') {
                const data = await dataService.scrapeMetadata(addQuery)
                if (data) setSearchResults([data])
                else alert('No se pudo capturar información de esa URL')
            }
        } catch (e) {
            console.error("Search error", e)
            alert("Error al buscar información")
        } finally {
            setIsSearching(false)
        }
    }

    const handleAddAsWish = (item: Partial<Book>) => {
        const newWish: Book = {
            isbn: item.isbn || `WISH-${Date.now()}`,
            title: item.title || 'Sin Título',
            authors: item.authors || ['Desconocido'],
            publisher: item.publisher || '',
            description: item.description || '',
            pageCount: item.pageCount || 0,
            coverPath: item.coverUrl || '',
            status: 'wishlist',
            wishlistPriority: 2,
            updatedAt: new Date().toISOString()
        }
        onSaveBook(newWish)
        setIsAddingNew(false)
        setAddQuery('')
        setSearchResults([])
        setSelectedBook(newWish)
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{
                maxWidth: isMobile ? '100%' : '900px',
                height: isMobile ? '100%' : '80vh',
                borderRadius: isMobile ? 0 : '24px',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <header className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Gift color="#8b7ba8" />
                        <h2 style={{ margin: 0 }}>Lista de Deseos</h2>
                    </div>
                    <button className="close-btn" onClick={onClose} title="Cerrar"><X /></button>
                </header>

                <div className="modal-body" style={{ flexDirection: isMobile ? 'column' : 'row', padding: isMobile ? '15px' : '30px', flex: 1, overflow: 'hidden' }}>
                    {/* List Column */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.1)', paddingRight: isMobile ? 0 : '20px', minWidth: isMobile ? '100%' : '300px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div className="search-bar" style={{ margin: 0, padding: 0, flex: 1, position: 'relative' }}>
                                <Search size={18} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                                <input
                                    className="search-input"
                                    placeholder="Buscar en deseos..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    style={{ borderRadius: '12px', paddingLeft: '45px', width: '100%', maxWidth: 'none' }}
                                />
                            </div>
                            <button
                                onClick={() => setIsAddingNew(true)}
                                style={{
                                    background: '#8b7ba8',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '12px',
                                    width: '40px',
                                    height: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    flexShrink: 0
                                }}
                                title="Añadir libro externo"
                            >
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Search size={20} />
                                    <Plus size={16} strokeWidth={3} style={{ position: 'absolute', bottom: -5, right: -5, background: '#8b7ba8', borderRadius: '50%' }} />
                                </div>
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {wishlistBooks.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                    No hay libros en tu lista de deseos.
                                </div>
                            ) : (
                                wishlistBooks.map(book => (
                                    <div
                                        key={book.isbn}
                                        onClick={() => { setSelectedBook(book); setIsAddingNew(false); }}
                                        style={{
                                            padding: '12px',
                                            borderRadius: '12px',
                                            background: selectedBook?.isbn === book.isbn && !isAddingNew ? 'rgba(139, 123, 168, 0.1)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${selectedBook?.isbn === book.isbn && !isAddingNew ? '#8b7ba8' : 'rgba(255,255,255,0.05)'}`,
                                            marginBottom: '8px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            gap: '12px',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <div style={{ width: '40px', height: '60px', background: '#1a1a1a', borderRadius: '4px', overflow: 'hidden', flexShrink: 0 }}>
                                            {book.coverPath ? <img src={book.coverPath} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontSize: '8px', textAlign: 'center', marginTop: '20px' }}>No Cover</div>}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{book.title}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#8b7ba8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{book.authors.join(', ')}</div>
                                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                                {[1, 2, 3].map(s => (
                                                    <Star key={s} size={10} fill={s <= (book.wishlistPriority || 0) ? '#f59e0b' : 'none'} color={s <= (book.wishlistPriority || 0) ? '#f59e0b' : '#444'} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Detail Column */}
                    <div style={{ flex: 1.5, paddingLeft: isMobile ? 0 : '20px', marginTop: isMobile ? '20px' : 0, overflowY: 'auto' }}>
                        {isAddingNew ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h3 style={{ margin: 0 }}>Añadir nuevo deseo</h3>
                                    <button
                                        className="close-btn"
                                        onClick={() => setIsAddingNew(false)}
                                        style={{
                                            position: 'static',
                                            marginLeft: 'auto'
                                        }}
                                        title="Cancelar"
                                    >
                                        <X />
                                    </button>
                                </div>

                                <div style={{ display: 'flex', gap: '5px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '12px' }}>
                                    {(['search', 'url', 'isbn'] as const).map(m => (
                                        <button
                                            key={m}
                                            onClick={() => { setAddMethod(m); setSearchResults([]); setAddQuery(''); }}
                                            style={{
                                                flex: 1,
                                                padding: '8px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: addMethod === m ? 'rgba(139, 123, 168, 0.2)' : 'transparent',
                                                color: addMethod === m ? '#8b7ba8' : '#888',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {m === 'search' ? 'Por Nombre' : m === 'url' ? 'Por Link' : 'Por ISBN'}
                                        </button>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', gap: '10px', position: 'relative' }}>
                                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                                    <input
                                        className="search-input"
                                        style={{ margin: 0, flex: 1, borderRadius: '8px', paddingLeft: '40px' }}
                                        placeholder={addMethod === 'search' ? "Título o autor..." : addMethod === 'url' ? "Link de la librería..." : "ISBN de 13 dígitos..."}
                                        value={addQuery}
                                        onChange={e => setAddQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearchExternal()}
                                    />
                                    <button
                                        onClick={handleSearchExternal}
                                        disabled={isSearching}
                                        style={{
                                            background: '#8b7ba8',
                                            color: '#000',
                                            border: 'none',
                                            borderRadius: '12px',
                                            width: '45px',
                                            height: '45px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            flexShrink: 0
                                        }}
                                    >
                                        {isSearching ? <RefreshCw className="spin" style={{ width: 24, height: 24, minWidth: 24, minHeight: 24 }} /> : <Globe style={{ width: 24, height: 24, minWidth: 24, minHeight: 24 }} strokeWidth={2.5} />}
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {searchResults.map((res, i) => (
                                        <div
                                            key={res.isbn || i}
                                            style={{
                                                display: 'flex',
                                                gap: '15px',
                                                padding: '12px',
                                                background: 'rgba(255,255,255,0.03)',
                                                borderRadius: '12px',
                                                border: '1px solid rgba(255,255,255,0.05)',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div style={{ width: '45px', height: '65px', background: '#1a1a1a', borderRadius: '4px', overflow: 'hidden', flexShrink: 0 }}>
                                                {res.coverUrl ? <img src={res.coverUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontSize: '8px', textAlign: 'center', marginTop: '20px' }}>-</div>}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.title}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#888' }}>{res.authors?.join(', ')}</div>
                                            </div>
                                            <button
                                                onClick={() => handleAddAsWish(res)}
                                                style={{ background: 'rgba(139, 123, 168, 0.1)', color: '#8b7ba8', border: '1px solid rgba(139, 123, 168, 0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer' }}
                                            >
                                                Añadir
                                            </button>
                                        </div>
                                    ))}
                                    {searchResults.length === 0 && !isSearching && addQuery && (
                                        <div style={{ textAlign: 'center', padding: '20px', color: '#444', fontSize: '0.9rem' }}>
                                            Presiona Enter para buscar datos externos.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : selectedBook ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    <div style={{ width: '100px', height: '150px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', flexShrink: 0 }}>
                                        {selectedBook.coverPath ? <img src={selectedBook.coverPath} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="placeholder-cover">No Cover</div>}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <h3 style={{ margin: '0 0 5px 0', fontSize: '1.2rem' }}>{selectedBook.title}</h3>
                                        <p style={{ color: '#8b7ba8', margin: 0, fontWeight: 500 }}>{selectedBook.authors.join(', ')}</p>

                                        <button
                                            onClick={() => openGoogleSearch(selectedBook)}
                                            style={{ marginTop: '15px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px', borderRadius: '12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}
                                        >
                                            <Globe size={18} /> Buscar en Google
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div className="input-field">
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>¿Dónde lo viste?</label>
                                        <input
                                            className="edit-input"
                                            value={selectedBook.wishlistLocation || ''}
                                            onChange={e => handleUpdateWish({ wishlistLocation: e.target.value })}
                                            placeholder="Tienda o link..."
                                            style={{ margin: 0 }}
                                        />
                                    </div>
                                    <div className="input-field">
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>Precio estimado</label>
                                        <input
                                            className="edit-input"
                                            value={selectedBook.wishlistPrice || ''}
                                            onChange={e => handleUpdateWish({ wishlistPrice: e.target.value })}
                                            placeholder="$..."
                                            style={{ margin: 0 }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>Prioridad de compra</label>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        {[1, 2, 3].map(s => (
                                            <button
                                                key={s}
                                                onClick={() => handleUpdateWish({ wishlistPriority: s })}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                <Star size={28} fill={s <= (selectedBook.wishlistPriority || 0) ? '#f59e0b' : 'none'} color={s <= (selectedBook.wishlistPriority || 0) ? '#f59e0b' : '#333'} />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: '8px' }}>Notas / Por qué lo quiero</label>
                                    <textarea
                                        className="edit-textarea"
                                        style={{ minHeight: '100px', margin: 0 }}
                                        value={selectedBook.wishlistNotes || ''}
                                        onChange={e => handleUpdateWish({ wishlistNotes: e.target.value })}
                                        placeholder="Alguna razón especial..."
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '15px', marginTop: 'auto', paddingTop: '10px' }}>
                                    {!isConverting ? (
                                        <button
                                            onClick={() => setIsConverting(true)}
                                            style={{ flex: 2, background: '#10b981', color: '#000', border: 'none', padding: '14px', borderRadius: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer' }}
                                        >
                                            <CheckCircle2 size={20} /> ¡Lo Compré!
                                        </button>
                                    ) : (
                                        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(16, 185, 129, 0.1)', padding: '15px', borderRadius: '16px', border: '1px solid #10b981' }}>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#10b981' }}>¿A qué biblioteca va?</div>
                                            <select
                                                className="edit-input"
                                                value={targetLibraryId}
                                                onChange={e => setTargetLibraryId(e.target.value)}
                                                style={{ margin: 0 }}
                                            >
                                                <option value="">(Sin Asignar)</option>
                                                {config?.libraries.map(l => (
                                                    <option key={l.id} value={l.id}>{l.name}</option>
                                                ))}
                                            </select>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button onClick={handleConvert} style={{ flex: 1, background: '#10b981', border: 'none', color: '#000', padding: '10px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Confirmar</button>
                                                <button onClick={() => setIsConverting(false)} style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '10px', borderRadius: '10px', cursor: 'pointer' }}>Cancelar</button>
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => handleDeleteWish(selectedBook)}
                                        style={{ flexShrink: 0, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', width: '50px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#444', textAlign: 'center' }}>
                                <Gift size={48} style={{ marginBottom: '15px', opacity: 0.2 }} />
                                <p>Añade uno nuevo usando <br />el botón "+" de la derecha.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
