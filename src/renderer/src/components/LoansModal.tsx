import React, { useState, useEffect } from 'react'
import { X, Search, Book as BookIcon, User, HandHelping, RotateCcw } from 'lucide-react'
import { Book } from '../types'

interface Props {
    books: Book[]
    onSaveBook: (book: Book) => void
    onClose: () => void
}

export const LoansModal: React.FC<Props> = ({ books, onSaveBook, onClose }) => {
    const [searchQuery, setSearchQuery] = useState('')
    const [filteredResults, setFilteredResults] = useState<Book[]>([])
    const [selectedBook, setSelectedBook] = useState<Book | null>(null)
    const [borrowerName, setBorrowerName] = useState('')
    const [loanDate, setLoanDate] = useState(new Date().toISOString().split('T')[0])

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredResults([])
            return
        }
        const query = searchQuery.toLowerCase()
        const results = books.filter(b =>
            b.title.toLowerCase().includes(query) ||
            b.isbn.includes(query)
        ).slice(0, 5) // Limit results
        setFilteredResults(results)
    }, [searchQuery, books])

    const handleSelectBook = (book: Book) => {
        setSelectedBook(book)
        setBorrowerName(book.borrowerName || '')
        setLoanDate(book.loanDate || new Date().toISOString().split('T')[0])
    }

    const handleLoan = () => {
        if (!selectedBook || !borrowerName.trim()) return
        const updatedBook = {
            ...selectedBook,
            status: 'borrowed' as const,
            borrowerName: borrowerName.trim(),
            loanDate: loanDate,
            updatedAt: new Date().toISOString()
        }
        onSaveBook(updatedBook)
        setSelectedBook(null)
        setSearchQuery('')
    }

    const handleReturn = () => {
        if (!selectedBook) return
        const updatedBook = {
            ...selectedBook,
            status: 'available' as const,
            borrowerName: '',
            loanDate: '',
            updatedAt: new Date().toISOString()
        }
        onSaveBook(updatedBook)
        setSelectedBook(null)
        setSearchQuery('')
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content loans-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <header className="modal-header">
                    <h2>Gestión de Préstamos</h2>
                    <button className="close-btn" onClick={onClose}><X size={24} /></button>
                </header>

                <div className="modal-body loans-modal-body" style={{ minHeight: '300px', flexDirection: 'column' }}>
                    {!selectedBook ? (
                        <>
                            <div className="search-box-container" style={{
                                position: 'relative',
                                marginBottom: '25px',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                transition: 'all 0.2s'
                            }}>
                                <Search size={20} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
                                <input
                                    className="admin-input"
                                    style={{
                                        padding: '15px 15px 15px 50px',
                                        width: '100%',
                                        fontSize: '1rem',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#fff',
                                        outline: 'none',
                                        margin: 0
                                    }}
                                    placeholder="Buscar por título o ISBN..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div className="search-results">
                                {filteredResults.map(book => (
                                    <div
                                        key={book.isbn}
                                        className="search-result-item"
                                        onClick={() => handleSelectBook(book)}
                                        style={{
                                            padding: '12px',
                                            background: 'rgba(255,255,255,0.05)',
                                            borderRadius: '12px',
                                            marginBottom: '10px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    >
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '8px',
                                            background: book.status === 'borrowed' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <BookIcon size={20} color={book.status === 'borrowed' ? '#f59e0b' : '#10b981'} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: '600', color: '#fff' }}>{book.title}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                                {book.status === 'borrowed'
                                                    ? `Prestado a ${book.borrowerName} (${book.loanDate ? book.loanDate.split('-').reverse().join('/') : ''})`
                                                    : 'Disponible'
                                                }
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {searchQuery && filteredResults.length === 0 && (
                                    <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>No se encontraron libros.</div>
                                )}
                                {!searchQuery && (
                                    <div style={{ textAlign: 'center', color: '#666', padding: '40px 20px' }}>
                                        Escribe el nombre de un libro para empezar.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="loan-form" style={{ animation: 'fadeIn 0.3s ease' }}>
                            <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(139, 123, 168, 0.1)', borderRadius: '12px', border: '1px solid rgba(139, 123, 168, 0.2)' }}>
                                <div style={{ fontSize: '0.8rem', color: '#a78bfa', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Libro seleccionado</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>{selectedBook.title}</div>
                            </div>

                            {selectedBook.status === 'borrowed' ? (
                                <div style={{ marginBottom: '25px', padding: '10px' }}>
                                    <p style={{ color: '#94a3b8', margin: '0 0 15px 0' }}>Este libro está actualmente prestado a:</p>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        fontSize: '1.4rem',
                                        fontWeight: '700',
                                        color: '#fff',
                                        background: 'rgba(255,255,255,0.03)',
                                        padding: '15px',
                                        borderRadius: '12px',
                                        marginBottom: '15px'
                                    }}>
                                        <User size={24} color="#a78bfa" /> {selectedBook.borrowerName}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8' }}>
                                        <HandHelping size={18} /> Prestado el {selectedBook.loanDate ? selectedBook.loanDate.split('-').reverse().join('/') : ''}
                                    </div>
                                </div>
                            ) : (
                                <div className="form-content">
                                    <div className="form-group" style={{ marginBottom: '20px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '0.9rem' }}>¿A quién se lo prestás?</label>
                                        <input
                                            className="admin-input"
                                            style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                                            value={borrowerName}
                                            onChange={e => setBorrowerName(e.target.value)}
                                            placeholder="Nombre de la persona"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '0.9rem' }}>Fecha de préstamo</label>
                                        <input
                                            type="date"
                                            className="admin-input"
                                            style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', colorScheme: 'dark' }}
                                            value={loanDate}
                                            onChange={e => setLoanDate(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="modal-footer" style={{ marginTop: '30px', padding: 0, background: 'none', border: 'none', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    className="cancel-footer-btn"
                                    onClick={() => setSelectedBook(null)}
                                    style={{ margin: 0, padding: '10px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}
                                >
                                    Volver
                                </button>
                                {selectedBook.status === 'borrowed' ? (
                                    <button
                                        className="save-footer-btn"
                                        onClick={handleReturn}
                                        style={{ margin: 0, padding: '10px 20px', background: '#10b981', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                    >
                                        <RotateCcw size={18} /> Marcar como devuelto
                                    </button>
                                ) : (
                                    <button
                                        className="save-footer-btn"
                                        onClick={handleLoan}
                                        disabled={!borrowerName.trim()}
                                        style={{
                                            margin: 0,
                                            padding: '12px 24px',
                                            background: borrowerName.trim() ? '#8b7ba8' : 'rgba(139, 123, 168, 0.2)',
                                            border: 'none',
                                            borderRadius: '10px',
                                            color: '#fff',
                                            fontWeight: 'bold',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            cursor: borrowerName.trim() ? 'pointer' : 'not-allowed',
                                            opacity: borrowerName.trim() ? 1 : 0.6,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <HandHelping size={20} /> Confirmar Préstamo
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
