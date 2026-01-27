import axios from 'axios'

export interface BookMetadata {
    title: string
    authors: string[]
    publisher?: string
    pageCount?: number
    description?: string
    coverUrl?: string
    isbn?: string // Added for internal use in refactored logic
}

export class MetadataService {
    async fetchByISBN(isbn: string): Promise<BookMetadata | null> {
        // 1. Try Google Books with ISBN (Spanish preference)
        let book = await this.fetchGoogleBooks(isbn, true)

        // 2. If no result, try Google Books without language restriction
        if (!book) {
            book = await this.fetchGoogleBooks(isbn, false)
        }

        // 3. If we have a book but it's "bad" (no cover, no description, or English description)
        // Try fallback search by title/author to find a Spanish record
        if (book && (!book.description || !book.coverUrl || this.isEnglish(book.description))) {
            const titleSearch = await this.fetchGoogleByTitle(book.title, book.authors[0])
            if (titleSearch) {
                // Keep the original ISBN but use better metadata
                book = { ...book, ...titleSearch, isbn: book.isbn } as any
            }
        }

        // 4. Try to improve with Inventaire
        if (!book || !book.description || !book.coverUrl) {
            const invBook = await this.fetchInventaire(isbn)
            if (invBook) {
                if (!book) book = { isbn, ...invBook } as any
                else {
                    book.description = book.description || invBook.description
                    book.coverUrl = book.coverUrl || invBook.coverUrl
                }
            }
        }

        // 5. Try OpenLibrary as a last resort
        if (!book || !book.description || !book.coverUrl) {
            const olBook = await this.fetchOpenLibrary(isbn)
            if (olBook) {
                if (!book) book = olBook
                else {
                    book.description = book.description || olBook.description
                    book.coverUrl = book.coverUrl || olBook.coverUrl
                }
            }
        }

        if (book) {
            book.isbn = isbn
        }
        return book
    }

    private isEnglish(text: string): boolean {
        if (!text) return false
        const enWords = [' the ', ' is ', ' of ', ' and ', ' with ', ' for ', ' was ', ' but ']
        const matches = enWords.filter(w => text.toLowerCase().includes(w)).length
        return matches >= 2 // Simple heuristic
    }

    private async fetchGoogleBooks(isbn: string, esOnly: boolean): Promise<BookMetadata | null> {
        try {
            const langParam = esOnly ? '&langRestrict=es' : ''
            const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${langParam}`
            const response = await axios.get(url)

            if (response.data.totalItems > 0 && response.data.items?.length > 0) {
                return this.mapGoogleBook(response.data.items[0].volumeInfo)
            }
        } catch (error) {
            console.warn(`Google Books (ISBN, esOnly=${esOnly}) failed:`, error)
        }
        return null
    }

    private async fetchGoogleByTitle(title: string, author: string): Promise<Partial<BookMetadata> | null> {
        try {
            // Search by title and author, forcing Spanish results
            const query = `intitle:${encodeURIComponent(title)}${author ? `+inauthor:${encodeURIComponent(author)}` : ''}`
            const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&langRestrict=es&maxResults=3`
            const response = await axios.get(url)

            if (response.data.totalItems > 0 && response.data.items?.length > 0) {
                // Find the first one with a description
                const items = response.data.items
                const best = items.find((i: any) => i.volumeInfo.description) || items[0]
                return this.mapGoogleBook(best.volumeInfo)
            }
        } catch (error) {
            console.warn('Google Books (Title Search) failed:', error)
        }
        return null
    }

    private mapGoogleBook(info: any): BookMetadata {
        return {
            title: info.title,
            authors: info.authors || [],
            publisher: info.publisher,
            pageCount: info.pageCount,
            description: info.description,
            coverUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:')
                || info.imageLinks?.smallThumbnail?.replace('http:', 'https:')
        }
    }

    private async fetchInventaire(isbn: string): Promise<Partial<BookMetadata> | null> {
        try {
            // Inventaire.io ISBN lookup
            const url = `https://inventaire.io/api/data?action=isbn&value=${isbn}`
            const response = await axios.get(url)

            if (response.data && response.data.entities) {
                // Find the primary book entity (often starts with 'wd:' or 'inv:')
                const entities = response.data.entities
                const firstKey = Object.keys(entities)[0]
                const info = entities[firstKey]

                if (info) {
                    const labels = info.labels || {}
                    const descriptions = info.descriptions || {}

                    // Prefer Spanish label/description
                    const title = labels.es || labels.en || Object.values(labels)[0] || 'Sin Título'
                    const description = descriptions.es || descriptions.en || Object.values(descriptions)[0] || ''

                    // Simple mapping of claims (authors, etc) - Inventaire uses Wikidata-like props
                    // P50 is usually author. This gets complex, but for basic info:

                    return {
                        title: typeof title === 'string' ? title : title.value,
                        authors: info.claims?.P50 ? ['Autor Desconocido (ver Inventaire)'] : [],
                        description: typeof description === 'string' ? description : description.value,
                        coverUrl: info.claims?.P18 ? `https://inventaire.io/img/entities/${info.claims.P18[0]}` : undefined
                    }
                }
            }
        } catch (error) {
            console.warn('Inventaire failed:', error)
        }
        return null
    }

    private async fetchOpenLibrary(isbn: string): Promise<BookMetadata | null> {
        try {
            const key = `ISBN:${isbn}`
            const url = `https://openlibrary.org/api/books?bibkeys=${key}&format=json&jscmd=data`
            const response = await axios.get(url)

            if (response.data[key]) {
                const info = response.data[key]
                return {
                    title: info.title,
                    authors: info.authors ? info.authors.map((a: any) => a.name) : [],
                    publisher: info.publishers ? info.publishers[0]?.name : undefined,
                    pageCount: info.number_of_pages,
                    description: typeof info.description === 'string' ? info.description : info.description?.value,
                    coverUrl: info.cover?.large || info.cover?.medium || info.cover?.small
                }
            }
        } catch (error) {
            console.warn('Open Library failed:', error)
        }
        return null
    }
}
