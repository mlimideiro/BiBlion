import React from 'react'
import { Book } from '../types'
import { dataService } from '../services/dataService'

interface Props {
    book: Book
    isSelectionMode: boolean
    isSelected: boolean
    onToggleSelection: (e: React.MouseEvent) => void
    layoutMode?: 'list' | 'grid' | 'full'
}

export const BookListItem: React.FC<Props> = ({
    book,
    isSelectionMode,
    isSelected,
    onToggleSelection,
    layoutMode = 'grid'
}) => {
    return (
        <div className={`book-item ${isSelected ? 'selected' : ''} mode-${layoutMode}`}>
            <div className="book-cover">
                {isSelectionMode && (
                    <div className="selection-overlay" onClick={onToggleSelection}>
                        <div className={`custom-checkbox ${isSelected ? 'checked' : ''}`}>
                            {isSelected && <span className="check-icon">✓</span>}
                        </div>
                    </div>
                )}
                {(book.coverPath || book.coverUrl) ? (
                    <img
                        src={dataService.getCoverUrl(book)}
                        alt={book.title}
                    />
                ) : (
                    <div className="placeholder-cover">Sin Tapa</div>
                )}
                {(!book.coverPath && !book.coverUrl || book.authors.length === 0) && (
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
