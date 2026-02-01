import { useState, useEffect, useRef } from 'react'
import { BookListItem } from './components/BookListItem'
import { SearchBar } from './components/SearchBar'
import { Trash2, LayoutGrid, Settings, Download, X, Sparkles } from 'lucide-react'
import { SettingsModal } from './components/SettingsModal'
import { dataService } from './services/dataService'
import { Book, Config, Library } from './types'
import './index.css'
import './components/components.css'
import logo from './assets/logo.png'
import { Login } from './components/Login'
import { AdminDashboard } from './components/AdminDashboard'

function App() {
    const [books, setBooks] = useState<Book[]>([])
    const [config, setConfig] = useState<Config | null>(null)
    const [currentUser, setCurrentUser] = useState<string | null>(localStorage.getItem('biblion_user'))
    const [isLoggedIn, setIsLoggedIn] = useState(!!currentUser)
    const [isSuperAdmin, setIsSuperAdmin] = useState(localStorage.getItem('biblion_role') === 'admin')
    const [filteredBooks, setFilteredBooks] = useState<Book[]>([])
    const [menuOpen, setMenuOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [selectedIsbns, setSelectedIsbns] = useState<string[]>([])
    const [thumbnailSize, setThumbnailSize] = useState<'S' | 'M' | 'L' | 'XL'>(
        (localStorage.getItem('thumbSize') as any) || 'L'
    )
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedTag, setSelectedTag] = useState<string | null>(null)
    const [isEditingBook, setIsEditingBook] = useState(false)
    const [showScraperPanel, setShowScraperPanel] = useState(false)
    const [scraperUrl, setScraperUrl] = useState('')
    const [bookMenuOpen, setBookMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const bookMenuRef = useRef<HTMLDivElement>(null)

    const THUMB_SIZES = {
        S: { w: '100px', h: '145px' },
        M: { w: '140px', h: '200px' },
        L: { w: '180px', h: '260px' },
        XL: { w: '240px', h: '345px' }
    }

    useEffect(() => {
        // Initial fetch
        if (currentUser) {
            dataService.getBooks(currentUser).then(setBooks)
            dataService.getConfig(currentUser).then(setConfig)
        }

        // Listen for updates
        window.electron?.onUpdate((data: any) => {
            // Check if update is for current user
            // data format: { username, books } or just books (legacy)
            // If data is array, it's legacy (or from fallback). 
            // BUT main.ts now sends { username, books }
            if (data.username && data.username === currentUser) {
                setBooks(data.books)
                // Update selectedBook if it's currently open to reflect latest DB changes
                setSelectedBook(prev => {
                    if (!prev) return null
                    const updated = data.books.find((b: Book) => b.isbn === prev.isbn)
                    return updated || null
                })
            }
        })

        window.electron?.onConfigUpdate((updatedConfig: Config) => {
            // Config update usually triggered by ourselves or mobile for same user
            // Ideally this should also carry username, but for now assuming valid
            setConfig(updatedConfig)
        })

        // Close menu on click outside
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false)
            }
            if (bookMenuRef.current && !bookMenuRef.current.contains(event.target as Node)) {
                setBookMenuOpen(false)
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
        if (!config || !currentUser) return
        const newConfig = { ...config, activeLibraryId: libId }
        await dataService.saveConfig(newConfig, currentUser)
        setConfig(newConfig)
    }

    const handleSaveLibraries = async (libs: Library[], tags: string[]) => {
        if (!config || !currentUser) return
        const newConfig = { ...config, libraries: libs, tags: tags }
        // If active library was deleted, fallback to default
        if (!libs.find(l => l.id === newConfig.activeLibraryId)) {
            newConfig.activeLibraryId = 'default'
        }
        await dataService.saveConfig(newConfig, currentUser)
        setConfig(newConfig)
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

    const mobileUrl = 'https://biblion-app.duckdns.org'

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
        if (selectedIsbns.length === 0 || !currentUser) return
        if (confirm(`¿Estás seguro de eliminar ${selectedIsbns.length} libros?`)) {
            try {
                const updatedBooks = await dataService.bulkDeleteBooks(selectedIsbns, currentUser)
                setBooks(updatedBooks)
                setSelectedIsbns([])
                setIsSelectionMode(false)
            } catch (e) {
                alert("Error en la eliminación masiva")
            }
        }
    }

    const handleBulkMove = async (libraryId: string) => {
        if (selectedIsbns.length === 0 || !currentUser) return
        try {
            const booksToUpdate = books
                .filter(b => selectedIsbns.includes(b.isbn))
                .map(b => ({ ...b, libraryId }))

            const updatedBooks = await dataService.bulkSaveBooks(booksToUpdate, currentUser)
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
        if (!selectedBook || !currentUser) return
        if (confirm('¿Estás seguro de eliminar este libro?')) {
            try {
                const updatedBooks = await dataService.deleteBook(selectedBook.isbn, currentUser)
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
            const data = await dataService.repairMetadata(selectedBook.isbn)
            if (data) {
                const updatedBook = { ...selectedBook, ...data }
                const updatedBooks = await dataService.saveBook(updatedBook, currentUser || undefined)
                setBooks(updatedBooks)
                setSelectedBook(updatedBook)
                alert("¡Datos actualizados!")
            } else {
                alert("No se encontró información adicional para este libro.")
            }
        } catch (e) {
            alert("Error al intentar completar los datos.")
        } finally {
            setRepairing(false)
        }
    }

    const handleMoveLibrary = async (libraryId: string) => {
        if (!selectedBook || !currentUser) return
        const updatedBook = { ...selectedBook, libraryId }
        const updatedBooks = await dataService.saveBook(updatedBook, currentUser)
        setBooks(updatedBooks)
        setSelectedBook(updatedBook)
    }

    const handleAddTagToBook = async (tagName: string) => {
        if (!selectedBook || !currentUser) return
        const currentTags = selectedBook.tags || []
        if (currentTags.includes(tagName)) return
        const updatedBook = { ...selectedBook, tags: [...currentTags, tagName] }
        const updatedBooks = await dataService.saveBook(updatedBook, currentUser)
        setBooks(updatedBooks)
        setSelectedBook(updatedBook)
    }

    const handleRemoveTagFromBook = async (tagName: string) => {
        if (!selectedBook || !currentUser) return
        const currentTags = selectedBook.tags || []
        const updatedBook = { ...selectedBook, tags: currentTags.filter(t => t !== tagName) }
        const updatedBooks = await dataService.saveBook(updatedBook, currentUser)
        setBooks(updatedBooks)
        setSelectedBook(updatedBook)
    }

    const handleEditSave = async (updatedData: Partial<Book>) => {
        if (!selectedBook || !currentUser) return
        try {
            const updatedBook = { ...selectedBook, ...updatedData }
            const updatedBooks = await dataService.saveBook(updatedBook, currentUser)
            setBooks(updatedBooks)
            setSelectedBook(updatedBook)
            setIsEditingBook(false)
        } catch (e) {
            alert("Error al guardar los cambios")
        }
    }

    const handleScrape = async () => {
        if (!scraperUrl || !currentUser) return
        try {
            const data = await dataService.scrapeMetadata(scraperUrl)
            if (data && selectedBook) {
                const updatedBook = { ...selectedBook, ...data }
                // Persist the changes immediately
                const updatedBooks = await dataService.saveBook(updatedBook, currentUser)
                setBooks(updatedBooks)
                setSelectedBook(updatedBook)
                setScraperUrl('')
                setShowScraperPanel(false)
                alert("¡Datos capturados con éxito!")
            } else {
                alert("No se pudo obtener información de esa URL.")
            }
        } catch (e) {
            alert("Error al capturar datos: " + (e as Error).message)
        }
    }

    const handleLogin = (username: string, isAdmin: boolean) => {
        setCurrentUser(username)
        setIsLoggedIn(true)
        if (isAdmin) {
            setIsSuperAdmin(true)
            localStorage.setItem('biblion_role', 'admin')
            localStorage.setItem('biblion_is_admin', 'true')
        } else {
            setIsSuperAdmin(false)
            localStorage.removeItem('biblion_role')
            localStorage.removeItem('biblion_is_admin')
        }
    }

    const handleLogout = () => {
        localStorage.removeItem('biblion_user')
        localStorage.removeItem('biblion_role')
        localStorage.removeItem('biblion_is_admin')
        setCurrentUser(null)
        setIsLoggedIn(false)
        setIsSuperAdmin(false)
    }

    if (!isLoggedIn) {
        return <Login onLogin={handleLogin} />
    }

    if (isSuperAdmin) {
        return <AdminDashboard onLogout={handleLogout} />
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
                    <div className="tags-carousel-wrapper">
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
                    <div className="modal-overlay" onClick={() => { setSelectedBook(null); setIsEditingBook(false); setShowScraperPanel(false); }}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <div className="modal-actions-header">
                                <div className="book-options-container" ref={bookMenuRef}>
                                    <button
                                        className={`icon-btn ${bookMenuOpen ? 'active' : ''}`}
                                        onClick={() => setBookMenuOpen(!bookMenuOpen)}
                                        title="Opciones"
                                    >
                                        <Settings size={20} />
                                    </button>

                                    {bookMenuOpen && (
                                        <div className="book-dropdown-menu">
                                            <div className="menu-item" onClick={() => { setIsEditingBook(!isEditingBook); setBookMenuOpen(false); }}>
                                                {isEditingBook ? 'Ver Detalles' : 'Editar Datos'}
                                            </div>
                                            <div className="menu-item" onClick={() => { setShowScraperPanel(!showScraperPanel); setBookMenuOpen(false); }}>
                                                {showScraperPanel ? 'Ocultar Captura' : 'Capturar desde URL'}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button className="close-btn" onClick={() => { setSelectedBook(null); setIsEditingBook(false); setShowScraperPanel(false); }}><X /></button>
                            </div>
                            <div className="modal-body">
                                <div className="modal-cover">
                                    {selectedBook.coverPath ? (
                                        <img src={dataService.getCoverUrl(selectedBook)} alt={selectedBook.title} />
                                    ) : (
                                        <div className="placeholder-cover">Sin Tapa</div>
                                    )}
                                </div>
                                <div className="modal-info" style={{ display: 'flex', flexDirection: 'column' }}>
                                    {isEditingBook ? (
                                        <div className="edit-mode-container">
                                            <input
                                                className="edit-input"
                                                defaultValue={selectedBook.title}
                                                onBlur={(e) => handleEditSave({ title: e.target.value })}
                                                placeholder="Título del libro"
                                            />
                                            <input
                                                className="edit-input"
                                                defaultValue={selectedBook.authors.join(', ')}
                                                onBlur={(e) => handleEditSave({ authors: e.target.value.split(',').map(a => a.trim()).filter(a => a) })}
                                                placeholder="Autores (separados por coma)"
                                            />
                                            <div className="modal-meta">
                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                    <input
                                                        className="edit-input"
                                                        defaultValue={selectedBook.publisher || ''}
                                                        onBlur={(e) => handleEditSave({ publisher: e.target.value })}
                                                        placeholder="Editorial"
                                                    />
                                                    <input
                                                        className="edit-input"
                                                        type="number"
                                                        defaultValue={selectedBook.pageCount || ''}
                                                        onBlur={(e) => handleEditSave({ pageCount: parseInt(e.target.value) || 0 })}
                                                        placeholder="Páginas"
                                                    />
                                                </div>
                                                <input
                                                    className="edit-input"
                                                    defaultValue={selectedBook.coverPath || ''}
                                                    onBlur={(e) => handleEditSave({ coverPath: e.target.value })}
                                                    placeholder="URL de la tapa"
                                                />
                                            </div>
                                            <textarea
                                                className="edit-textarea"
                                                defaultValue={selectedBook.description || ''}
                                                onBlur={(e) => handleEditSave({ description: e.target.value })}
                                                placeholder="Resumen del libro"
                                            />

                                            <div className="edit-actions">
                                                <button className="action-btn" onClick={() => setIsEditingBook(false)}>Terminar Edición</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
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
                                                                    .map(tag => (
                                                                        <option key={tag} value={tag}>{tag}</option>
                                                                    ))
                                                                }
                                                            </select>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {showScraperPanel && (
                                                <div className="scraper-panel">
                                                    <h4><Sparkles size={16} /> Capturar desde URL</h4>
                                                    <div className="scraper-input-group">
                                                        <input
                                                            className="edit-input"
                                                            style={{ marginBottom: 0 }}
                                                            placeholder="Pegar link (Cúspide, etc.)"
                                                            value={scraperUrl}
                                                            onChange={(e) => setScraperUrl(e.target.value)}
                                                        />
                                                        <button className="scraper-btn" onClick={handleScrape}>Capturar</button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="modal-footer" style={{ border: 'none', padding: '20px 0 20px 0', marginTop: 'auto' }}>
                                                <button className="repair-btn" onClick={handleRepair} disabled={repairing}>
                                                    <Sparkles size={18} />
                                                    <span>{repairing ? 'Buscando...' : 'Completar Datos'}</span>
                                                </button>
                                                <button className="action-btn danger" onClick={handleDelete}>
                                                    <Trash2 size={18} />
                                                    <span>Eliminar</span>
                                                </button>
                                            </div>
                                        </>
                                    )}
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
