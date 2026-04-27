import { useState, useEffect, useRef } from 'react'
import { BookListItem } from './components/BookListItem'
import { SearchBar } from './components/SearchBar'
import { LayoutGrid, Settings, User, HandHelping, X, Download, Gift, Trash2, RefreshCw, Tag, LogOut, BookPlus } from 'lucide-react'
import { SettingsModal } from './components/SettingsModal'
import { dataService } from './services/dataService'
import { Book, Config, Library } from './types'
import './index.css'
import './components/components.css'
import logo from './assets/logo.png'
import { Login } from './components/Login'
import { AdminDashboard } from './components/AdminDashboard'
import { LoansModal } from './components/LoansModal'
import { WishlistModal } from './components/WishlistModal'


function App() {
    const [books, setBooks] = useState<Book[]>([])
    const [config, setConfig] = useState<Config | null>(null)
    const [currentUser, setCurrentUser] = useState<string | null>(localStorage.getItem('biblion_user'))
    const [isLoggedIn, setIsLoggedIn] = useState(!!currentUser)
    const [isSuperAdmin, setIsSuperAdmin] = useState(localStorage.getItem('biblion_role') === 'admin')
    const [filteredBooks, setFilteredBooks] = useState<Book[]>([])
    const [menuOpen, setMenuOpen] = useState(false)
    const [settingsView, setSettingsView] = useState<'libraries' | 'tags' | null>(null)
    const [loansOpen, setLoansOpen] = useState(false)
    const [wishlistOpen, setWishlistOpen] = useState(false)
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
    const [selectedBook, setSelectedBook] = useState<Book | null>(null)
    const [repairing, setRepairing] = useState(false)
    const [repairCooldownEnd, setRepairCooldownEnd] = useState(0)
    const [cooldownRemaining, setCooldownRemaining] = useState(0)
    const [translating, setTranslating] = useState(false)
    const [translatedDescription, setTranslatedDescription] = useState<string | null>(null)
    const [importModalOpen, setImportModalOpen] = useState(false)
    const [importFile, setImportFile] = useState<File | null>(null)
    const [importBooksCount, setImportBooksCount] = useState(0)
    const [importing, setImporting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const bookMenuRef = useRef<HTMLDivElement>(null)
    const tagsRef = useRef<HTMLDivElement>(null)

    const THUMB_SIZES = {
        S: { w: '100px', h: '145px' },
        M: { w: '140px', h: '200px' },
        L: { w: '180px', h: '260px' },
        XL: { w: '240px', h: '345px' }
    }

    // Reset translation when switching books
    useEffect(() => {
        setTranslatedDescription(null)
    }, [selectedBook?.isbn])

    // Global cooldown timer for repair button
    useEffect(() => {
        if (repairCooldownEnd <= Date.now()) {
            setCooldownRemaining(0)
            return
        }
        const interval = setInterval(() => {
            const remaining = Math.ceil((repairCooldownEnd - Date.now()) / 1000)
            if (remaining <= 0) {
                setCooldownRemaining(0)
                clearInterval(interval)
            } else {
                setCooldownRemaining(remaining)
            }
        }, 1000)
        return () => clearInterval(interval)
    }, [repairCooldownEnd])

    const handleTranslate = async (text: string) => {
        setTranslating(true)
        try {
            const translated = await dataService.translateText(text)
            if (translated) {
                setTranslatedDescription(translated)
                // Persist the translation so it's saved when closing the book
                await handleEditSave({ description: translated })
            }
        } catch (e) {
            console.error('Translation failed:', e)
        } finally {
            setTranslating(false)
        }
    }

    useEffect(() => {
        if (currentUser) {
            dataService.getBooks(currentUser).then(setBooks)
            dataService.getConfig(currentUser).then(setConfig)
        } else {
            setBooks([])
            setConfig(null)
        }
    }, [currentUser])

    useEffect(() => {
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
                result = result.filter(b => (!b.libraryId || b.libraryId === "") && b.status !== 'wishlist')
            } else {
                result = result.filter(b => b.libraryId === config.activeLibraryId && b.status !== 'wishlist')
            }
        } else {
            result = result.filter(b => b.status !== 'wishlist')
        }

        // 2. Filter by search query
        if (searchQuery) {
            const normalizedQuery = normalizeText(searchQuery)
            result = result.filter(b => {
                const title = normalizeText(b.title || '')
                const authors = Array.isArray(b.authors) ? b.authors.map(a => normalizeText(a || '')) : []
                return title.includes(normalizedQuery) ||
                    authors.some(a => a.includes(normalizedQuery)) ||
                    (b.isbn && b.isbn.includes(searchQuery))
            })
        }

        // 3. Filter by tag
        if (selectedTag) {
            result = result.filter(b => Array.isArray(b.tags) && b.tags.includes(selectedTag))
        }

        setFilteredBooks(result)
    }, [books, config, searchQuery, selectedTag])

    const normalizeText = (text: string) => {
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    }

    const handleSearch = (query: string) => {
        setSearchQuery(query)
    }

    const handleTagSelect = (tag: string | null, event: React.MouseEvent) => {
        setSelectedTag(tag)
        // Center the selected tag smoothly
        const element = event.currentTarget as HTMLElement
        element.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
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
        await dataService.saveConfig(currentUser, newConfig)
        setConfig(newConfig)
    }

    const handleSaveLibraries = async (libs: Library[], tags: string[]) => {
        if (!config || !currentUser) return

        // Deduplicate tags case-insensitively before saving
        const uniqueTags: string[] = []
        const normalizedSet = new Set<string>()

        tags.forEach(tag => {
            const normalized = tag.trim().toLowerCase()
            if (!normalizedSet.has(normalized)) {
                normalizedSet.add(normalized)
                uniqueTags.push(tag.trim())
            }
        })

        const newConfig = { ...config, libraries: libs, tags: uniqueTags }
        // If active library was deleted, fallback to default
        if (!libs.find(l => l.id === newConfig.activeLibraryId)) {
            newConfig.activeLibraryId = 'default'
        }
        await dataService.saveConfig(currentUser, newConfig)
        setConfig(newConfig)
        setSettingsView(null)
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

    const triggerImport = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click()
        }
        setMenuOpen(false)
    }

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        console.log("File selected:", file)
        if (!file) return

        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string
                console.log("File content length:", content.length)
                const json = JSON.parse(content)
                console.log("Parsed JSON array length:", json.length)
                if (Array.isArray(json)) {
                    setImportFile(file)
                    setImportBooksCount(json.length)
                    setImportModalOpen(true)
                } else {
                    alert("El archivo no tiene el formato correcto (debe ser una lista de libros).")
                }
            } catch (error) {
                console.error("Error parsing JSON:", error)
                alert("Error al leer el archivo JSON.")
            }
        }
        reader.readAsText(file)
        // Reset input
        event.target.value = ''
    }

    const processImport = async (mode: 'merge' | 'replace') => {
        if (!importFile || !currentUser) {
            console.error("Missing importFile or currentUser", { importFile, currentUser })
            return
        }
        setImporting(true)
        console.log("Starting import in mode:", mode)
        try {
            const reader = new FileReader()
            reader.onload = async (e) => {
                const content = e.target?.result as string
                const json = JSON.parse(content)
                console.log("Calling dataService.importBooks...")
                const updatedBooks = await dataService.importBooks(currentUser, json, mode)
                console.log("Import success, updated books count:", updatedBooks.length)
                setBooks(updatedBooks)
                setImportModalOpen(false)
                setImportFile(null)
                alert(`Importación completada con éxito (${mode === 'merge' ? 'Mezclar' : 'Reemplazar'}).`)
            }
            reader.readAsText(importFile)
        } catch (error) {
            alert("Error durante la importación.")
            console.error("Import error:", error)
        } finally {
            setImporting(false)
        }
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
                const updatedBooks = await dataService.bulkDeleteBooks(currentUser, selectedIsbns)
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

            const updatedBooks = await dataService.bulkSaveBooks(currentUser, booksToUpdate)
            setBooks(updatedBooks)
            setSelectedIsbns([])
            setIsSelectionMode(false)
            alert("Libros movidos con éxito")
        } catch (e) {
            alert("Error al mover los libros")
        }
    }


    const handleDelete = async () => {
        if (!selectedBook || !currentUser) return
        if (confirm('¿Estás seguro de eliminar este libro?')) {
            try {
                const updatedBooks = await dataService.deleteBook(currentUser, selectedBook.isbn)
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
            const data = await dataService.repairMetadata(selectedBook.isbn, selectedBook.title, selectedBook.authors[0])
            if (data) {
                // If it's a wishlist item, we want to keep the WISH- prefix even after repair
                // Unless the repair specifically found a better ISBN (which we still prefix with WISH-)
                let finalIsbn = data.isbn || selectedBook.isbn
                // Match WISH with or without hyphen, case-insensitive
                if (selectedBook.status === 'wishlist' && !/^WISH-?/i.test(finalIsbn)) {
                    finalIsbn = `WISH-${finalIsbn}`
                }

                const { coverUrl, ...restData } = data
                const finalCoverPath = coverUrl || restData.coverPath || selectedBook.coverPath
                const updatedBook = { ...selectedBook, ...restData, isbn: finalIsbn, coverPath: finalCoverPath }

                // If ISBN changed, delete the old record to avoid duplicates
                if (finalIsbn !== selectedBook.isbn) {
                    await dataService.deleteBook(currentUser || '', selectedBook.isbn)
                }

                const updatedBooks = await dataService.saveBook(currentUser || '', updatedBook)
                setBooks(updatedBooks)
                setSelectedBook(updatedBook)
                alert("¡Datos completados con éxito!")
            } else {
                alert("No se encontró información adicional para este libro.")
            }
        } catch (e) {
            alert("Error al intentar completar los datos.")
        } finally {
            setRepairing(false)
            // Start global 25s cooldown
            const cooldownEnd = Date.now() + 25000
            setRepairCooldownEnd(cooldownEnd)
            setCooldownRemaining(25)
        }
    }

    const handleMoveLibrary = async (libraryId: string) => {
        if (!selectedBook || !currentUser) return
        const updatedBook = { ...selectedBook, libraryId }
        const updatedBooks = await dataService.saveBook(currentUser, updatedBook)
        setBooks(updatedBooks)
        setSelectedBook(updatedBook)
    }

    const handlePurchaseBook = async (oldIsbn: string, newBook: Book) => {
        if (!currentUser) return
        try {
            // 1. Delete the wishlist entry (WISH- prefix)
            await dataService.deleteBook(currentUser, oldIsbn)
            // 2. Save the new book entry (real ISBN)
            const updatedBooks = await dataService.saveBook(currentUser, newBook)
            setBooks(updatedBooks)
        } catch (e) {
            console.error("Error purchasing book", e)
            alert("Error al procesar la compra del libro")
        }
    }

    const handleAddTagToBook = async (tagName: string) => {
        if (!selectedBook || !currentUser) return
        const currentTags = selectedBook.tags || []
        const normalizedInput = tagName.trim()

        const isDuplicate = currentTags.some(
            t => t.trim().toLowerCase() === normalizedInput.toLowerCase()
        )

        if (isDuplicate) return

        const updatedBook = { ...selectedBook, tags: [...currentTags, normalizedInput] }
        const updatedBooks = await dataService.saveBook(currentUser, updatedBook)
        setBooks(updatedBooks)
        setSelectedBook(updatedBook)
    }

    const handleRemoveTagFromBook = async (tagName: string) => {
        if (!selectedBook || !currentUser) return
        const currentTags = selectedBook.tags || []
        const updatedBook = { ...selectedBook, tags: currentTags.filter(t => t !== tagName) }
        const updatedBooks = await dataService.saveBook(currentUser, updatedBook)
        setBooks(updatedBooks)
        setSelectedBook(updatedBook)
    }

    const handleEditSave = async (updatedData: Partial<Book>) => {
        if (!selectedBook || !currentUser) return
        try {
            const updatedBook = { ...selectedBook, ...updatedData }

            // If ISBN is changing, we must delete the old record first 
            // because the backend uses ISBN as the unique key.
            if (updatedData.isbn && updatedData.isbn !== selectedBook.isbn) {
                if (selectedBook.coverPath && selectedBook.coverPath.startsWith(`local:${currentUser}:`)) {
                    const success = await dataService.renameCoverImage(currentUser, selectedBook.isbn, updatedData.isbn)
                    if (success) {
                        const cleanNewIsbn = updatedData.isbn.replace(/[^a-zA-Z0-9]/g, '')
                        updatedBook.coverPath = `local:${currentUser}:${cleanNewIsbn}.jpg`
                    } else {
                        console.warn("No se pudo renombrar la portada en el disco, se conserva el nombre viejo.")
                        // If it fails, keep the old coverPath so it doesn't break the image display.
                    }
                }
                await dataService.deleteBook(currentUser, selectedBook.isbn)
            }

            const updatedBooks = await dataService.saveBook(currentUser, updatedBook)
            setBooks(updatedBooks)
            setSelectedBook(updatedBook)
            // Removed setIsEditingBook(false) to keep the modal open when navigating fields
        } catch (e) {
            alert("Error al guardar los cambios")
        }
    }

    const handleScrape = async () => {
        if (!scraperUrl || !currentUser) return
        try {
            const data = await dataService.scrapeMetadata(scraperUrl)
            if (data && selectedBook) {
                let finalIsbn = data.isbn || selectedBook.isbn

                // If it's a wishlist item, we want to keep the WISH- prefix
                if (selectedBook.status === 'wishlist' && finalIsbn && !/^WISH-?/i.test(finalIsbn)) {
                    finalIsbn = `WISH-${finalIsbn}`
                }

                const updatedBook = { ...selectedBook, ...data, isbn: finalIsbn }

                // If ISBN changed (e.g. from WISH- placeholder to real), delete old one
                if (finalIsbn !== selectedBook.isbn) {
                    await dataService.deleteBook(currentUser, selectedBook.isbn)
                }

                const updatedBooks = await dataService.saveBook(currentUser, updatedBook)
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

    const handleSaveBook = async (book: Book) => {
        if (!currentUser) return
        try {
            const updatedBooks = await dataService.saveBook(currentUser, book)
            setBooks(updatedBooks)
            // If the book updated is the one currently viewing, update it too
            if (selectedBook && selectedBook.isbn === book.isbn) {
                setSelectedBook(book)
            }
        } catch (e) {
            alert("Error al actualizar el estado del libro")
        }
    }

    const handleLogin = (username: string, isAdmin: boolean) => {
        localStorage.setItem('biblion_user', username)
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
                    <div className="brand" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <img src={logo} alt="Logo" style={{ width: 45, height: 45, borderRadius: 8 }} />
                        <h1 style={{ margin: '0 15px 0 10px', whiteSpace: 'nowrap' }}>BiBlion</h1>
                        {currentUser && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                                <User size={20} color="#cdd6f4" />
                                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#cdd6f4' }}>{currentUser}</span>
                            </div>
                        )}
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

                        <button
                            className="select-mode-btn loans-btn"
                            onClick={() => setLoansOpen(true)}
                            title="Gestionar Préstamos"
                        >
                            <HandHelping size={16} />
                            <span>Préstamos</span>
                        </button>
                    </div>

                    <div className="controls-group right">
                        <button
                            className="select-mode-btn"
                            onClick={() => setWishlistOpen(true)}
                            style={{ background: 'rgba(139, 123, 168, 0.1)', color: '#8b7ba8', border: '1px solid rgba(139, 123, 168, 0.2)', marginRight: '10px' }}
                            title="Lista de Deseos"
                        >
                            <Gift size={16} />
                            <span>Deseados</span>
                        </button>

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
                                    <div className="menu-item" onClick={() => { setMenuOpen(false); setSettingsView('libraries'); }}>
                                        <LayoutGrid size={18} />
                                        <span>Bibliotecas</span>
                                    </div>
                                    <div className="menu-item" onClick={() => { setMenuOpen(false); setSettingsView('tags'); }}>
                                        <Tag size={18} />
                                        <span>Etiquetas</span>
                                    </div>
                                    <div className="menu-item" onClick={() => { 
                                        setMenuOpen(false); 
                                        setSelectedBook({
                                            isbn: `manual_${Date.now()}`,
                                            title: "",
                                            authors: [],
                                            createdAt: new Date().toISOString(),
                                            updatedAt: new Date().toISOString()
                                        } as Book);
                                        setIsEditingBook(true);
                                    }}>
                                        <BookPlus size={18} />
                                        <span>Agregar Libro</span>
                                    </div>
                                    <div className="menu-item" onClick={() => { setMenuOpen(false); handleExport(); }}>
                                        <Download size={18} />
                                        <span>Exportar Backup</span>
                                    </div>
                                    <div className="menu-item" onClick={() => { setMenuOpen(false); triggerImport(); }}>
                                        <Download size={18} style={{ transform: 'rotate(180deg)' }} />
                                        <span>Importar Backup</span>
                                    </div>
                                    <div
                                        className="menu-item danger"
                                        onClick={() => { setMenuOpen(false); handleLogout(); }}
                                        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '5px', color: '#f38ba8' }}
                                    >
                                        <LogOut size={18} />
                                        <span>Cerrar Sesión</span>
                                    </div>
                                </div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept=".json"
                                onChange={handleFileSelect}
                            />
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
                        <div
                            className="tag-pills-container"
                            ref={tagsRef}
                            onWheel={(e) => {
                                if (tagsRef.current) {
                                    // Translate vertical wheel scroll to horizontal
                                    tagsRef.current.scrollLeft += e.deltaY;
                                }
                            }}
                        >
                            <div
                                className={`tag-pill ${selectedTag === null ? 'active' : ''}`}
                                onClick={(e) => handleTagSelect(null, e)}
                            >
                                Todos
                            </div>
                            {config.tags.map(tag => (
                                <div
                                    key={tag}
                                    className={`tag-pill ${selectedTag === tag ? 'active' : ''}`}
                                    onClick={(e) => handleTagSelect(tag, e)}
                                >
                                    {tag}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className={`book-list ${thumbnailSize === 'S' ? 'is-list-mode' : ''}`}>
                    {filteredBooks.map(book => (
                        <div
                            key={book.isbn}
                            onClick={() => isSelectionMode ? toggleBookSelection(book.isbn) : setSelectedBook(book)}
                            style={{ cursor: 'pointer' }}
                        >
                            <BookListItem
                                book={book}
                                layoutMode={thumbnailSize === 'S' ? 'list' : 'grid'}
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

            {importModalOpen && (
                <div className="modal-overlay" onClick={() => !importing && setImportModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h2>Importar Backup</h2>
                            {!importing && <button className="close-btn" onClick={() => setImportModalOpen(false)}><X size={20} /></button>}
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            <p style={{ marginBottom: '20px' }}>Se encontraron <strong>{importBooksCount}</strong> libros en el archivo seleccionado.</p>

                            <div className="import-options">
                                <div
                                    className="import-option"
                                    onClick={() => !importing && processImport('merge')}
                                    style={{
                                        padding: '15px',
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: '8px',
                                        marginBottom: '10px',
                                        cursor: importing ? 'wait' : 'pointer',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        opacity: importing ? 0.7 : 1
                                    }}
                                >
                                    <h3 style={{ margin: '0 0 5px 0', color: 'var(--accent)' }}>Mezclar (Merge)</h3>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#ccc' }}>
                                        Agrega los libros del backup a tu biblioteca actual.
                                        Si un libro ya existe, se actualizarán sus datos.
                                        <strong>No se borra nada.</strong>
                                    </p>
                                </div>

                                <div
                                    className="import-option"
                                    onClick={() => !importing && processImport('replace')}
                                    style={{
                                        padding: '15px',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        borderRadius: '8px',
                                        cursor: importing ? 'wait' : 'pointer',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        opacity: importing ? 0.7 : 1
                                    }}
                                >
                                    <h3 style={{ margin: '0 0 5px 0', color: '#f87171' }}>Reemplazar (Restore)</h3>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#ccc' }}>
                                        ⚠️ <strong>BORRA</strong> toda tu colección actual y la reemplaza con el contenido del backup.
                                        Úsalo para restaurar una copia exacta.
                                    </p>
                                </div>
                            </div>

                            {importing && <p style={{ textAlign: 'center', marginTop: '15px' }}>Procesando importación...</p>}
                        </div>
                    </div>
                </div>
            )}
            {
                selectedBook && (
                    <div className="modal-overlay" onClick={() => { 
                        if (isEditingBook) return;
                        setSelectedBook(null); 
                        setIsEditingBook(false); 
                        setShowScraperPanel(false); 
                    }}>
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
                                                key={`title-${selectedBook.title}`}
                                                className="edit-input"
                                                defaultValue={selectedBook.title}
                                                onBlur={(e) => handleEditSave({ title: e.target.value })}
                                                placeholder="Título del libro"
                                            />
                                            <input
                                                key={`authors-${selectedBook.authors.join(',')}`}
                                                className="edit-input"
                                                defaultValue={selectedBook.authors.join(', ')}
                                                onBlur={(e) => handleEditSave({ authors: e.target.value.split(',').map(a => a.trim()).filter(a => a) })}
                                                placeholder="Autores (separados por coma)"
                                            />
                                            <div className="modal-meta">
                                                <input
                                                    key={`isbn-${selectedBook.isbn}`}
                                                    className="edit-input"
                                                    defaultValue={selectedBook.isbn}
                                                    onBlur={(e) => handleEditSave({ isbn: e.target.value })}
                                                    placeholder="ISBN del libro"
                                                />
                                                <div style={{ display: 'flex', gap: '10px' }}>
                                                    <input
                                                        key={`publisher-${selectedBook.publisher || ''}`}
                                                        className="edit-input"
                                                        defaultValue={selectedBook.publisher || ''}
                                                        onBlur={(e) => handleEditSave({ publisher: e.target.value })}
                                                        placeholder="Editorial"
                                                    />
                                                    <input
                                                        key={`pages-${selectedBook.pageCount || ''}`}
                                                        className="edit-input"
                                                        type="number"
                                                        defaultValue={selectedBook.pageCount || ''}
                                                        onBlur={(e) => handleEditSave({ pageCount: parseInt(e.target.value) || 0 })}
                                                        placeholder="Páginas"
                                                    />
                                                </div>
                                                <input
                                                    key={`cover-${selectedBook.coverPath || ''}`}
                                                    className="edit-input"
                                                    defaultValue={selectedBook.coverPath || ''}
                                                    onBlur={(e) => handleEditSave({ coverPath: e.target.value })}
                                                    placeholder="URL de la tapa"
                                                />
                                            </div>
                                            <textarea
                                                key={`desc-${selectedBook.description || ''}`}
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

                                                    {selectedBook.status === 'borrowed' && (
                                                        <div style={{
                                                            marginTop: '15px',
                                                            padding: '12px',
                                                            background: 'rgba(245, 158, 11, 0.1)',
                                                            border: '1px solid rgba(245, 158, 11, 0.2)',
                                                            borderRadius: '8px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '10px'
                                                        }}>
                                                            <HandHelping size={18} color="#8b7ba8" />
                                                            <div>
                                                                <div style={{ color: '#8b7ba8', fontWeight: 'bold', fontSize: '0.9rem' }}>PRESTADO A:</div>
                                                                <div style={{ color: '#fff', fontSize: '1.1rem' }}>{selectedBook.borrowerName} <span style={{ color: '#888', fontSize: '0.85rem' }}>({selectedBook.loanDate ? selectedBook.loanDate.split('-').reverse().join('/') : ''})</span></div>
                                                            </div>
                                                        </div>
                                                    )}

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
                                                {selectedBook.description ? (() => {
                                                    const enWords = [' the ', ' is ', ' of ', ' and ', ' with ', ' for ', ' was ', ' but ', ' this ', ' that ']
                                                    const lower = (selectedBook.description || '').toLowerCase()
                                                    const isEnglish = enWords.filter(w => lower.includes(w)).length >= 2
                                                    const displayDesc = translatedDescription || selectedBook.description
                                                    return (
                                                        <div className="modal-desc">
                                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                Resumen:
                                                                {isEnglish && !translatedDescription && (
                                                                    <button
                                                                        title="Traducir al español"
                                                                        onClick={() => handleTranslate(selectedBook.description || '')}
                                                                        disabled={translating}
                                                                        style={{
                                                                            background: 'rgba(225, 177, 106, 0.15)',
                                                                            border: '1px solid rgba(225, 177, 106, 0.4)',
                                                                            color: '#E1B16A',
                                                                            borderRadius: '6px',
                                                                            padding: '2px 10px',
                                                                            fontSize: '0.75rem',
                                                                            cursor: translating ? 'wait' : 'pointer',
                                                                            fontWeight: 600,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px'
                                                                        }}
                                                                    >
                                                                        {translating
                                                                            ? <RefreshCw size={12} className="spin-animate" />
                                                                            : '🌐'
                                                                        }
                                                                        {translating ? 'Traduciendo...' : 'Traducir'}
                                                                    </button>
                                                                )}
                                                                {translatedDescription && (
                                                                    <span style={{ fontSize: '0.7rem', color: '#888', fontWeight: 400 }}>traducido</span>
                                                                )}
                                                            </h4>
                                                            <p>{displayDesc}</p>
                                                        </div>
                                                    )
                                                })() : (
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
                                                    <h4>🔗 Capturar desde URL</h4>
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
                                                <button className={`repair-btn ${repairing ? 'repair-btn-searching' : ''}`} onClick={handleRepair} disabled={repairing || cooldownRemaining > 0}>
                                                    <RefreshCw size={18} className={repairing ? 'spin-animate' : ''} />
                                                    <span>{repairing ? 'Buscando...' : cooldownRemaining > 0 ? `Reintentar en ${cooldownRemaining}s` : 'Completar Datos'}</span>
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
                settingsView && config && (
                    <SettingsModal
                        libraries={config.libraries}
                        tags={config.tags}
                        activeView={settingsView}
                        onClose={() => setSettingsView(null)}
                        onSave={handleSaveLibraries}
                    />
                )
            }
            {
                loansOpen && (
                    <LoansModal
                        books={books}
                        onSaveBook={handleSaveBook}
                        onClose={() => setLoansOpen(false)}
                    />
                )
            }

            {
                wishlistOpen && (
                    <WishlistModal
                        books={books}
                        config={config}
                        onSaveBook={handleSaveBook}
                        onPurchaseBook={handlePurchaseBook}
                        onDeleteBook={(isbn) => {
                            if (currentUser) {
                                dataService.deleteBook(currentUser, isbn).then(setBooks)
                            }
                        }}
                        onClose={() => setWishlistOpen(false)}
                    />
                )
            }
        </div >
    )
}

export default App
