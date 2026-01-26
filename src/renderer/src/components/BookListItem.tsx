import React from 'react'

interface Book {
    isbn: string
    title: string
    authors: string[]
    coverPath?: string
}

interface Props {
    book: Book
}

export const BookListItem: React.FC<Props> = ({ book }) => {
    return (
        <div className="book-item">
            <div className="book-cover">
                {book.coverPath ? (
                    <img
                        src={book.coverPath.startsWith('http') ? book.coverPath : `file://${book.coverPath}`}
                        alt={book.title}
                    />
                ) : (
                    <div className="placeholder-cover">Sin Tapa</div>
                )}
            </div>
            <div className="book-info">
                <h3>{book.title}</h3>
                <p>{book.authors.join(', ')}</p>
            </div>
        </div>
    )
}
