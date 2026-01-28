import React from 'react'

interface Book {
    isbn: string
    title: string
    authors: string[]
    coverPath?: string
}

interface Props {
    book: Book
    isSelectionMode: boolean
    isSelected: boolean
    onToggleSelection: (e: React.MouseEvent) => void
}

export const BookListItem: React.FC<Props> = ({ book, isSelectionMode, isSelected, onToggleSelection }) => {
    return (
        <div className={`book-item ${isSelected ? 'selected' : ''}`}>
            <div className="book-cover">
                {isSelectionMode && (
                    <div className="selection-overlay" onClick={onToggleSelection}>
                        <div className={`custom-checkbox ${isSelected ? 'checked' : ''}`}>
                            {isSelected && <span className="check-icon">✓</span>}
                        </div>
                    </div>
                )}
                {book.coverPath ? (
                    <img
                        src={book.coverPath.startsWith('http') ? book.coverPath : `file://${book.coverPath}`}
                        alt={book.title}
                    />
                ) : (
                    <div className="placeholder-cover">Sin Tapa</div>
                )}
                {(!book.coverPath || book.authors.length === 0) && (
                    <div className="incomplete-badge">Incompleto</div>
                )}
            </div>
            <div className="book-info">
                <h3>{book.title}</h3>
                <p>{book.authors.join(', ')}</p>
            </div>
        </div>
    )
}
