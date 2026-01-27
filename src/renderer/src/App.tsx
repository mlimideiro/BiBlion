import { useState, useEffect, useRef } from 'react'
import { BookListItem } from './components/BookListItem'
import { SearchBar } from './components/SearchBar'
import { Settings, Download, X, Sparkles, LayoutGrid } from 'lucide-react'
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
    libraryId: string
}

interface Library {
    id: string
    name: string
}

interface Config {
    libraries: Library[]
    activeLibraryId: string
}

function App() {
    const [books, setBooks] = useState<Book[]>([])
    const [config, setConfig] = useState<Config | null>(null)
    const [filteredBooks, setFilteredBooks] = useState<Book[]>([])
    const [serverInfo, setServerInfo] = useState<{ ip: string; port: number } | null>(null)

    const [menuOpen, setMenuOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Initial fetch
        window.electron.getBooks().then(setBooks)
        window.electron.getServerInfo().then(setServerInfo)
        window.electron.getConfig().then(setConfig)

        // Listen for updates
        window.electron.onUpdate((_event: any, updatedBooks: Book[]) => {
            setBooks(updatedBooks)
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
        if (!config) {
            setFilteredBooks(books)
            return
        }
        // Filter by active library
        const libraryBooks = books.filter(b => b.libraryId === config.activeLibraryId || !b.libraryId)
        setFilteredBooks(libraryBooks)
    }, [books, config])

    const normalizeText = (text: string) => {
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    }

    const handleSearch = (query: string) => {
        if (!config) return

        const libraryBooks = books.filter(b => b.libraryId === config.activeLibraryId || !b.libraryId)

        if (!query) {
            setFilteredBooks(libraryBooks)
            return
        }

        const normalizedQuery = normalizeText(query)
        const result = libraryBooks.filter(b => {
            const title = normalizeText(b.title)
            const authors = b.authors.map(a => normalizeText(a))
            return title.includes(normalizedQuery) ||
                authors.some(a => a.includes(normalizedQuery)) ||
                b.isbn.includes(query)
        })
        setFilteredBooks(result)
    }

    const handleSwitchLibrary = (id: string) => {
        if (!config) return
        const newConfig = { ...config, activeLibraryId: id }
        window.electron.saveConfig(newConfig).then(setConfig)
    }

    const handleSaveLibraries = (libs: Library[]) => {
        if (!config) return
        const newConfig = { ...config, libraries: libs }
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
        link.download = `biblioteka_backup_${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        setMenuOpen(false)
    }

    const mobileUrl = serverInfo ? `http://${serverInfo.ip}:${serverInfo.port}` : 'Cargando...'

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

    return (
        <div className="container">
            <header className="app-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <img src={logo} alt="Logo" style={{ width: 55, height: 55, borderRadius: 10 }} />
                        <h1 style={{ fontSize: '2.5rem' }}>BiBlion</h1>
                    </div>

                    {config && (
                        <div className="library-selector">
                            <LayoutGrid size={18} />
                            <select
                                value={config.activeLibraryId}
                                onChange={(e) => handleSwitchLibrary(e.target.value)}
                            >
                                {config.libraries.map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div className="server-info">
                        <span>📱 Escanea desde: </span>
                        <a href={mobileUrl} target="_blank" className="mobile-link">{mobileUrl}</a>
                    </div>

                    <div className="settings-container" ref={menuRef}>
                        <button className={`settings-btn ${menuOpen ? 'active' : ''}`} onClick={() => setMenuOpen(!menuOpen)}>
                            <Settings size={28} />
                        </button>

                        {menuOpen && (
                            <div className="settings-menu">
                                <div className="menu-item" onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}>
                                    <Settings size={18} />
                                    <span>Configuración</span>
                                </div>
                                <div className="menu-item" onClick={handleExport}>
                                    <Download size={18} />
                                    <span>Exportar (JSON)</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <div className="main-content">
                <SearchBar onSearch={handleSearch} />

                <div className="book-list">
                    {filteredBooks.map(book => (
                        <div key={book.isbn} onClick={() => setSelectedBook(book)} style={{ cursor: 'pointer' }}>
                            <BookListItem book={book} />
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

            {selectedBook && (
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

                                        <div className="modal-library-move" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <strong>Biblioteca:</strong>
                                            <select
                                                value={selectedBook.libraryId || 'default'}
                                                onChange={(e) => handleMoveLibrary(e.target.value)}
                                                style={{
                                                    background: '#333',
                                                    color: 'white',
                                                    border: '1px solid #444',
                                                    borderLeft: '4px solid var(--accent)',
                                                    borderRadius: '4px',
                                                    padding: '5px 10px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.9rem'
                                                }}
                                            >
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
            )}

            {settingsOpen && config && (
                <SettingsModal
                    libraries={config.libraries}
                    onClose={() => setSettingsOpen(false)}
                    onSave={handleSaveLibraries}
                />
            )}
        </div>
    )
}

export default App
