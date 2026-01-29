import React, { useState, useEffect } from 'react'
import { Book, Config } from '../types'
import { BookListItem } from './BookListItem'
import { SearchBar } from './SearchBar'
import { dataService } from '../services/dataService'
import { X, Sparkles, Trash2, ChevronRight } from 'lucide-react'

interface Props {
    books: Book[]
    config: Config | null
    onUpdateBooks: (books: Book[]) => void
    onUpdateConfig?: (config: Config) => void
    isMobile?: boolean
    onBack?: () => void
}

export const LibraryView: React.FC<Props> = ({
    books,
    config,
    onUpdateBooks,
    onUpdateConfig,
    isMobile = false,
    onBack
}) => {
    const [filteredBooks, setFilteredBooks] = useState<Book[]>([])
    const [thumbnailSize, setThumbnailSize] = useState<'S' | 'M' | 'L' | 'XL'>(
        (localStorage.getItem('thumbSize') as any) || 'L'
    )
    const [mobileLayout, setMobileLayout] = useState<'list' | 'grid' | 'full'>(
        (localStorage.getItem('mobileLayout') as any) || 'grid'
    )
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedTag, setSelectedTag] = useState<string | null>(null)
    const [selectedBook, setSelectedBook] = useState<Book | null>(null)
    const [isEditingBook, setIsEditingBook] = useState(false)
    const [repairing, setRepairing] = useState(false)
    const [isLibrarySelectorOpen, setIsLibrarySelectorOpen] = useState(false)

    const activeLibraryName = config?.activeLibraryId === 'unassigned'
        ? 'Sin Asignar'
        : config?.libraries.find(l => l.id === config.activeLibraryId)?.name || 'Todas las Bibliotecas'

    const handleSetMobileLayout = (mode: 'list' | 'grid' | 'full') => {
        setMobileLayout(mode)
        localStorage.setItem('mobileLayout', mode)
    }

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
        // If config.activeLibraryId is null/undefined, show all books (default)

        // 2. Filter by Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            result = result.filter(b =>
                b.title.toLowerCase().includes(q) ||
                b.authors.some(a => a.toLowerCase().includes(q)) ||
                b.isbn.includes(q)
            )
        }

        // 3. Filter by Tag
        if (selectedTag) {
            result = result.filter(b => b.tags?.includes(selectedTag))
        }

        setFilteredBooks(result)
    }, [books, config, searchQuery, selectedTag])

    const handleSearch = (query: string) => {
        setSearchQuery(query)
    }

    const handleSaveThumbnailSize = (size: 'S' | 'M' | 'L' | 'XL') => {
        setThumbnailSize(size)
        localStorage.setItem('thumbSize', size)
    }

    const handleRepair = async () => {
        if (!selectedBook) return
        setRepairing(true)
        try {
            const data = await dataService.repairMetadata(selectedBook.isbn)
            if (data) {
                const updatedBook = { ...selectedBook, ...data }
                const updatedBooks = await dataService.saveBook(updatedBook)
                onUpdateBooks(updatedBooks)
                setSelectedBook(updatedBook)
            }
        } catch (e) {
            console.error("Repair error", e)
        } finally {
            setRepairing(false)
        }
    }

    const handleDelete = async () => {
        if (!selectedBook) return
        if (window.confirm('¿Eliminar libro?')) {
            const updatedBooks = await dataService.deleteBook(selectedBook.isbn)
            onUpdateBooks(updatedBooks)
            setSelectedBook(null)
        }
    }

    const handleLibraryChange = async (libraryId: string) => {
        if (!selectedBook) return
        const updatedBook = { ...selectedBook, libraryId }
        try {
            const updatedBooks = await dataService.saveBook(updatedBook)
            onUpdateBooks(updatedBooks)
            setSelectedBook(updatedBook)
        } catch (e) {
            console.error("Error updating library", e)
        }
    }

    return (
        <div className={`library-container ${isMobile ? 'mobile' : ''}`}>

            {isMobile && config && (
                <div
                    className="library-selector-trigger"
                    onClick={() => setIsLibrarySelectorOpen(true)}
                >
                    <div className="trigger-label">Biblioteca</div>
                    <div className="trigger-value">
                        {activeLibraryName}
                        <ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} />
                    </div>
                </div>
            )}
            <SearchBar
                onSearch={handleSearch}
                thumbnailSize={thumbnailSize}
                setThumbnailSize={handleSaveThumbnailSize}
                isMobile={isMobile}
                mobileLayout={mobileLayout}
                onSetMobileLayout={handleSetMobileLayout}
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

            <div className={`book-list size-${thumbnailSize} ${isMobile ? `mode-${mobileLayout}` : ''}`}>
                {filteredBooks.map(book => (
                    <div key={book.isbn} onClick={() => setSelectedBook(book)} style={{ cursor: 'pointer' }}>
                        <BookListItem
                            book={book}
                            isSelectionMode={false}
                            isSelected={false}
                            onToggleSelection={() => { }}
                            layoutMode={isMobile ? mobileLayout : 'grid'}
                        />
                    </div>
                ))}
                {filteredBooks.length === 0 && (
                    <div className="empty-state">
                        <p>No se encontraron libros.</p>
                    </div>
                )}
            </div>

            {selectedBook && (
                <div className="modal-overlay" onClick={() => { setSelectedBook(null); setIsEditingBook(false); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-actions-header">
                            <button className="close-btn" onClick={() => { setSelectedBook(null); setIsEditingBook(false); }}>
                                <X size={22} color="black" strokeWidth={3} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="modal-cover">
                                {selectedBook.coverPath ? (
                                    <img src={dataService.getCoverUrl(selectedBook)} alt={selectedBook.title} />
                                ) : (
                                    <div className="placeholder-cover">Sin Tapa</div>
                                )}
                            </div>

                            <div className="modal-info">
                                <h2>{selectedBook.title}</h2>
                                <p className="modal-author">{selectedBook.authors.join(', ')}</p>

                                <div className="modal-meta">
                                    <p><strong>ISBN:</strong> {selectedBook.isbn}</p>
                                    {selectedBook.publisher && <p><strong>Editorial:</strong> {selectedBook.publisher}</p>}
                                    {selectedBook.pageCount && <p><strong>Páginas:</strong> {selectedBook.pageCount}</p>}

                                    <div className="modal-library-select">
                                        <strong>Biblioteca:</strong>
                                        <select
                                            value={selectedBook.libraryId || ""}
                                            onChange={(e) => handleLibraryChange(e.target.value)}
                                        >
                                            <option value="">Sin Asignar</option>
                                            {config?.libraries.map(lib => (
                                                <option key={lib.id} value={lib.id}>{lib.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="modal-desc">
                                    {selectedBook.description || <em>Sin resumen disponible.</em>}
                                </div>

                                <div className="modal-footer">
                                    <button className="action-btn" onClick={() => setIsEditingBook(!isEditingBook)}>
                                        {isEditingBook ? 'Ver' : 'Editar'}
                                    </button>
                                    <button className="repair-btn" onClick={handleRepair} disabled={repairing}>
                                        <Sparkles size={18} />
                                        <span>
                                            {repairing ? '...' : (
                                                <>
                                                    <div>Completar</div>
                                                    <div>Datos</div>
                                                </>
                                            )}
                                        </span>
                                    </button>
                                    <button className="action-btn danger" onClick={handleDelete}>
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Mobile Library Selector Sheet */}
            {isMobile && isLibrarySelectorOpen && (
                <div className="action-sheet-overlay" onClick={() => setIsLibrarySelectorOpen(false)}>
                    <div className="action-sheet" onClick={e => e.stopPropagation()}>
                        <div className="action-sheet-header">
                            <h3>Seleccionar Biblioteca</h3>
                            <button onClick={() => setIsLibrarySelectorOpen(false)} className="action-sheet-close-btn">
                                <X size={22} color="black" strokeWidth={3} />
                            </button>
                        </div>
                        <div className="action-sheet-content">
                            <button
                                className={`action-sheet-item ${!config?.activeLibraryId ? 'active' : ''}`}
                                onClick={async () => {
                                    if (!config) return
                                    const newConfig = { ...config, activeLibraryId: "" }
                                    await dataService.saveConfig(newConfig)
                                    onUpdateConfig?.(newConfig)
                                    setIsLibrarySelectorOpen(false)
                                }}
                            >
                                Todas las Bibliotecas
                                {!config?.activeLibraryId && <Sparkles size={16} />}
                            </button>
                            <button
                                className={`action-sheet-item ${config?.activeLibraryId === 'unassigned' ? 'active' : ''}`}
                                onClick={async () => {
                                    if (!config) return
                                    const newConfig = { ...config, activeLibraryId: 'unassigned' }
                                    await dataService.saveConfig(newConfig)
                                    onUpdateConfig?.(newConfig)
                                    setIsLibrarySelectorOpen(false)
                                }}
                            >
                                Sin Asignar
                                {config?.activeLibraryId === 'unassigned' && <Sparkles size={16} />}
                            </button>
                            {config?.libraries.map(lib => (
                                <button
                                    key={lib.id}
                                    className={`action-sheet-item ${config.activeLibraryId === lib.id ? 'active' : ''}`}
                                    onClick={async () => {
                                        const newConfig = { ...config, activeLibraryId: lib.id }
                                        await dataService.saveConfig(newConfig)
                                        onUpdateConfig?.(newConfig)
                                        setIsLibrarySelectorOpen(false)
                                    }}
                                >
                                    {lib.name}
                                    {config.activeLibraryId === lib.id && <Sparkles size={16} />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
