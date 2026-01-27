import { useState, useEffect, useRef } from 'react'
import { BookListItem } from './components/BookListItem'
import { SearchBar } from './components/SearchBar'
import { Trash2, LayoutGrid, Settings, Download, X, Sparkles } from 'lucide-react'
import { SettingsModal } from './components/SettingsModal'
import './index.css'
import './components/components.css'
import logo from './assets/logo.png'

// Define types locally or import
interface Book {
    isbn: string
    title: string
    authors: string[]
    publisher?: string
    description?: string
    coverPath?: string
    pageCount?: number
    libraryId?: string
    tags?: string[]
}

interface Library {
    id: string
    name: string
}

interface Config {
    libraries: Library[]
    activeLibraryId: string
    tags: string[]
}

function App() {
    const [books, setBooks] = useState<Book[]>([])
    const [config, setConfig] = useState<Config | null>(null)
    const [filteredBooks, setFilteredBooks] = useState<Book[]>([])
    const [serverInfo, setServerInfo] = useState<{ ip: string; port: number } | null>(null)

    const [menuOpen, setMenuOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedIsbns, setSelectedIsbns] = useState<string[]>([])
    const [isRepairing, setIsRepairing] = useState<string | null>(null)
    const [thumbnailSize, setThumbnailSize] = useState<'S' | 'M' | 'L' | 'XL'>(
        (localStorage.getItem('thumbSize') as any) || 'L'
    )
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedTag, setSelectedTag] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    const THUMB_SIZES = {
        S: { w: '100px', h: '145px' },
        M: { w: '140px', h: '200px' },
        L: { w: '180px', h: '260px' },
        XL: { w: '240px', h: '345px' }
    }

    useEffect(() => {
        // Initial fetch
        window.electron.getBooks().then(setBooks)
        window.electron.getServerInfo().then(setServerInfo)
        window.electron.getConfig().then(setConfig)

        // Listen for updates
        window.electron.onUpdate((_event: any, updatedBooks: Book[]) => {
            setBooks(updatedBooks)
            // Update selectedBook if it's currently open to reflect latest DB changes
            setSelectedBook(prev => {
                if (!prev) return null
                const updated = updatedBooks.find(b => b.isbn === prev.isbn)
                return updated || null
            })
        })

        window.electron.onConfigUpdate((_event: any, updatedConfig: Config) => {
            setConfig(updatedConfig)
        })

        // Close menu on click outside
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        let result = books

        // 1. Filter by active library
        if (config && config.activeLibraryId) {
            if (config.activeLibraryId === 'unassigned') {
                result = result.filter(b => !b.libraryId || b.libraryId === "")
            } else {
                result = result.filter(b => b.libraryId === config.activeLibraryId)
            }
        }

        // 2. Filter by search query
        if (searchQuery) {
            const normalizedQuery = normalizeText(searchQuery)
            result = result.filter(b => {
                const title = normalizeText(b.title)
                const authors = b.authors.map(a => normalizeText(a))
                return title.includes(normalizedQuery) ||
                    authors.some(a => a.includes(normalizedQuery)) ||
                    b.isbn.includes(searchQuery)
            })
        }

        // 3. Filter by tag
        if (selectedTag) {
            result = result.filter(b => b.tags?.includes(selectedTag))
        }

        setFilteredBooks(result)
    }, [books, config, searchQuery, selectedTag])

    const normalizeText = (text: string) => {
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    }

    const handleSearch = (query: string) => {
        setSearchQuery(query)
    }

    // Apply thumbnail size to CSS variables
    useEffect(() => {
        const size = THUMB_SIZES[thumbnailSize]
        document.documentElement.style.setProperty('--book-w', size.w)
        document.documentElement.style.setProperty('--book-h', size.h)
        localStorage.setItem('thumbSize', thumbnailSize)
    }, [thumbnailSize])

    const handleSwitchLibrary = async (libId: string) => {
        if (!config) return
        const newConfig = { ...config, activeLibraryId: libId }
        window.electron.saveConfig(newConfig).then(setConfig)
    }

    const handleSaveLibraries = (libs: Library[], tags: string[]) => {
        if (!config) return
        const newConfig = { ...config, libraries: libs, tags: tags }
        // If active library was deleted, fallback to default
        if (!libs.find(l => l.id === newConfig.activeLibraryId)) {
            newConfig.activeLibraryId = 'default'
        }
        window.electron.saveConfig(newConfig).then(setConfig)
        setSettingsOpen(false)
    }

    const handleExport = () => {
        const dataStr = JSON.stringify(books, null, 2)
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = `biblion_backup_${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        setMenuOpen(false)
    }

    const mobileUrl = serverInfo ? `http://${serverInfo.ip}:${serverInfo.port}` : 'Cargando...'

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode)
        setSelectedIsbns([])
    }

    const toggleBookSelection = (isbn: string) => {
        if (selectedIsbns.includes(isbn)) {
            setSelectedIsbns(selectedIsbns.filter(id => id !== isbn))
        } else {
            setSelectedIsbns([...selectedIsbns, isbn])
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIsbns.length === 0) return
        if (confirm(`¿Estás seguro de eliminar ${selectedIsbns.length} libros?`)) {
            try {
                const updatedBooks = await window.electron.bulkDeleteBooks(selectedIsbns)
                setBooks(updatedBooks)
                setSelectedIsbns([])
                setIsSelectionMode(false)
            } catch (e) {
                alert("Error en la eliminación masiva")
            }
        }
    }

    const handleBulkMove = async (libraryId: string) => {
        if (selectedIsbns.length === 0) return
        try {
            const booksToUpdate = books
                .filter(b => selectedIsbns.includes(b.isbn))
                .map(b => ({ ...b, libraryId }))

            const updatedBooks = await window.electron.bulkSaveBooks(booksToUpdate)
            setBooks(updatedBooks)
            setSelectedIsbns([])
            setIsSelectionMode(false)
            alert("Libros movidos con éxito")
        } catch (e) {
            alert("Error al mover los libros")
        }
    }

    const [selectedBook, setSelectedBook] = useState<Book | null>(null)
    const [repairing, setRepairing] = useState(false)

    const handleDelete = async () => {
        if (!selectedBook) return
        if (confirm('¿Estás seguro de eliminar este libro?')) {
            try {
                const updatedBooks = await window.electron.deleteBook(selectedBook.isbn)
                setBooks(updatedBooks)
                setSelectedBook(null)
            } catch (e) {
                console.error("Error deleting book", e)
                alert("Error al eliminar el libro")
            }
        }
    }

    const handleRepair = async () => {
        if (!selectedBook) return
        setRepairing(true)
        try {
            const data = await window.electron.repairMetadata(selectedBook.isbn)
            if (data) {
                const updatedBook = { ...selectedBook, ...data }
                const updatedBooks = await window.electron.saveBook(updatedBook)
                setBooks(updatedBooks)
                setSelectedBook(updatedBook)
                alert("¡Datos actualizados!")
            } else {
                alert("No se encontró información adicional para este libro.")
            }
        } catch (e) {
            alert("Error al intentar reparar los datos.")
        } finally {
            setRepairing(false)
        }
    }

    const handleMoveLibrary = async (libraryId: string) => {
        if (!selectedBook) return
        const updatedBook = { ...selectedBook, libraryId }
        const updatedBooks = await window.electron.saveBook(updatedBook)
        setBooks(updatedBooks)
        setSelectedBook(updatedBook)
    }

    const handleAddTagToBook = async (tagName: string) => {
        if (!selectedBook) return
        const currentTags = selectedBook.tags || []
        if (currentTags.includes(tagName)) return
        const updatedBook = { ...selectedBook, tags: [...currentTags, tagName] }
        const updatedBooks = await window.electron.saveBook(updatedBook)
        setBooks(updatedBooks)
        setSelectedBook(updatedBook)
    }

    const handleRemoveTagFromBook = async (tagName: string) => {
        if (!selectedBook) return
        const currentTags = selectedBook.tags || []
        const updatedBook = { ...selectedBook, tags: currentTags.filter(t => t !== tagName) }
        const updatedBooks = await window.electron.saveBook(updatedBook)
        setBooks(updatedBooks)
        setSelectedBook(updatedBook)
    }

    return (
        <div className="container">
            <header className="app-header">
                <div className="header-top">
                    <div className="brand">
                        <img src={logo} alt="Logo" style={{ width: 45, height: 45, borderRadius: 8 }} />
                        <h1>BiBlion</h1>
                    </div>
                </div>

                <div className="header-controls">
                    <div className="controls-group">
                        {config && (
                            <div className="library-selector">
                                <LayoutGrid size={16} />
                                <select
                                    value={config.activeLibraryId || ''}
                                    onChange={(e) => handleSwitchLibrary(e.target.value)}
                                >
                                    <option value="">Todas las Bibliotecas</option>
                                    <option value="unassigned">(Sin Asignar)</option>
                                    {config.libraries.map(l => (
                                        <option key={l.id} value={l.id}>{l.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button
                            className={`select-mode-btn ${isSelectionMode ? 'active' : ''}`}
                            onClick={toggleSelectionMode}
                            title="Modo Selección"
                        >
                            {isSelectionMode ? <X size={16} /> : <LayoutGrid size={16} />}
                            <span>{isSelectionMode ? 'Cancelar' : 'Seleccionar'}</span>
                        </button>
                    </div>

                    <div className="controls-group right">
                        <div className="server-info">
                            <span style={{ marginRight: 8 }}>📲</span>
                            Escanea desde: <a href={mobileUrl} target="_blank" className="mobile-link">{mobileUrl}</a>
                        </div>

                        <div className="settings-container" ref={menuRef}>
                            <button
                                className={`settings-btn ${menuOpen ? 'active' : ''}`}
                                onClick={() => setMenuOpen(!menuOpen)}
                            >
                                <Settings size={22} />
                            </button>

                            {menuOpen && (
                                <div className="settings-menu">
                                    <div className="menu-item" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>
                                        <Settings size={18} />
                                        <span>Configuración</span>
                                    </div>
                                    <div className="menu-item" onClick={handleExport}>
                                        <Download size={18} />
                                        <span>Exportar Backup (JSON)</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <div className="main-content">
                <SearchBar
                    onSearch={handleSearch}
                    thumbnailSize={thumbnailSize}
                    setThumbnailSize={setThumbnailSize}
                />

                {config && config.tags.length > 0 && (
                    <div className="tag-pills-container">
                        <div
                            className={`tag-pill ${selectedTag === null ? 'active' : ''}`}
                            onClick={() => setSelectedTag(null)}
                        >
                            Todos
                        </div>
                        {config.tags.map(tag => (
                            <div
                                key={tag}
                                className={`tag-pill ${selectedTag === tag ? 'active' : ''}`}
                                onClick={() => setSelectedTag(tag)}
                            >
                                {tag}
                            </div>
                        ))}
                    </div>
                )}

                <div className="book-list">
                    {filteredBooks.map(book => (
                        <div
                            key={book.isbn}
                            onClick={() => isSelectionMode ? toggleBookSelection(book.isbn) : setSelectedBook(book)}
                            style={{ cursor: 'pointer' }}
                        >
                            <BookListItem
                                book={book}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedIsbns.includes(book.isbn)}
                                onToggleSelection={(e) => {
                                    e.stopPropagation()
                                    toggleBookSelection(book.isbn)
                                }}
                            />
                        </div>
                    ))}
                    {filteredBooks.length === 0 && (
                        <div className="empty-state">
                            <p>No se encontraron libros en esta biblioteca.</p>
                            <p className="sub-text">Cámbiala o usa la app móvil para escanear.</p>
                        </div>
                    )}
                </div>
            </div>

            {
                isSelectionMode && selectedIsbns.length > 0 && (
                    <div className="bulk-action-bar">
                        <div className="bulk-info">
                            {selectedIsbns.length} seleccionados
                        </div>
                        <div className="bulk-actions">
                            <select
                                className="action-btn"
                                onChange={(e) => {
                                    handleBulkMove(e.target.value)
                                    e.target.value = ""
                                }}
                                defaultValue=""
                            >
                                <option value="" disabled>Mover a...</option>
                                {config?.libraries.map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </select>
                            <button className="action-btn danger delete-btn" onClick={handleBulkDelete}>
                                <Trash2 size={18} />
                                <span>Eliminar</span>
                            </button>
                        </div>
                    </div>
                )
            }
            {
                selectedBook && (
                    <div className="modal-overlay" onClick={() => setSelectedBook(null)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <button className="close-btn" onClick={() => setSelectedBook(null)}><X /></button>
                            <div className="modal-body">
                                <div className="modal-cover">
                                    {selectedBook.coverPath ? (
                                        <img src={selectedBook.coverPath.startsWith('http') ? selectedBook.coverPath : `file://${selectedBook.coverPath}`} alt={selectedBook.title} />
                                    ) : (
                                        <div className="placeholder-cover">Sin Tapa</div>
                                    )}
                                </div>
                                <div className="modal-info" style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div>
                                        <h2 style={{ margin: '0 0 10px 0', paddingRight: 40 }}>{selectedBook.title}</h2>
                                        <p className="modal-author">{selectedBook.authors.join(', ')}</p>
                                        <div className="modal-meta">
                                            <p><strong>ISBN:</strong> {selectedBook.isbn}</p>
                                            {selectedBook.publisher && <p><strong>Editorial:</strong> {selectedBook.publisher}</p>}
                                            {selectedBook.pageCount && <p><strong>Páginas:</strong> {selectedBook.pageCount}</p>}

                                            <div className="modal-library-move" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <strong>Biblioteca:</strong>
                                                <select
                                                    value={selectedBook.libraryId || ""}
                                                    onChange={(e) => handleMoveLibrary(e.target.value)}
                                                    style={{
                                                        background: '#333',
                                                        color: 'white',
                                                        border: '1px solid #444',
                                                        borderLeft: '4px solid var(--accent)',
                                                        borderRadius: '4px',
                                                        padding: '5px 10px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.9rem',
                                                        width: '100%',
                                                        maxWidth: '200px'
                                                    }}
                                                >
                                                    <option value="">(Sin Asignar)</option>
                                                    {config?.libraries.map(l => (
                                                        <option key={l.id} value={l.id}>{l.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        {selectedBook.description ? (
                                            <div className="modal-desc">
                                                <h4>Resumen:</h4>
                                                <p>{selectedBook.description}</p>
                                            </div>
                                        ) : (
                                            <p className="modal-desc"><em>Sin resumen disponible.</em></p>
                                        )}

                                        <div className="book-tags-section" style={{ marginTop: '15px' }}>
                                            <h4>Etiquetas:</h4>
                                            <div className="book-tags-list">
                                                {selectedBook.tags?.map(tag => (
                                                    <span key={tag} className="book-tag-badge">
                                                        {tag}
                                                        <button className="remove-tag-btn" onClick={() => handleRemoveTagFromBook(tag)}>
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                                {config?.tags.filter(t => !selectedBook.tags?.includes(t)).length! > 0 && (
                                                    <select
                                                        className="add-tag-btn"
                                                        value=""
                                                        onChange={(e) => {
                                                            handleAddTagToBook(e.target.value)
                                                            e.target.value = ""
                                                        }}
                                                    >
                                                        <option value="" disabled>+ Agregar etiqueta</option>
                                                        {config?.tags
                                                            .filter(t => !selectedBook.tags?.includes(t))
                                                            .map(tag => <option key={tag} value={tag}>{tag}</option>)
                                                        }
                                                    </select>
                                                )}
                                                {config?.tags.length === 0 && (
                                                    <small style={{ color: '#666' }}>No hay etiquetas definidas en configuración.</small>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #333' }}>
                                        <button
                                            className="repair-btn"
                                            onClick={handleRepair}
                                            disabled={repairing}
                                        >
                                            <Sparkles size={18} /> {repairing ? 'Buscando...' : 'Reparar Datos'}
                                        </button>

                                        <button
                                            onClick={handleDelete}
                                            style={{
                                                background: '#ef4444',
                                                color: 'white',
                                                border: 'none',
                                                padding: '12px 24px',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '1rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
                                            }}
                                        >
                                            🗑️ Eliminar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                settingsOpen && config && (
                    <SettingsModal
                        libraries={config.libraries}
                        tags={config.tags}
                        onClose={() => setSettingsOpen(false)}
                        onSave={handleSaveLibraries}
                    />
                )
            }
        </div >
    )
}

export default App
