import axios from 'axios'
import https from 'https'

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
    async lookup(isbn: string, title?: string, author?: string): Promise<BookMetadata | null> {
        const cleanIsbn = this.normalizeIsbn(isbn)
        const searchIsbn = cleanIsbn.toUpperCase()

        let book: BookMetadata | null = null

        // If it looks like a real ISBN, try searching by it
        if (searchIsbn.length >= 10 && searchIsbn.length <= 13 && /^[0-9X]+$/.test(searchIsbn)) {
            // 1. Try Google Books with ISBN (Spanish preference)
            book = await this.fetchGoogleBooks(searchIsbn, true)

            // 2. If no result, try BNE (Biblioteca Nacional de España)
            if (!book) {
                book = await this.fetchBNE(searchIsbn)
            }

            // 3. If no result, try Google Books without language restriction
            if (!book) {
                book = await this.fetchGoogleBooks(searchIsbn, false)
            }
        }

        // 4. Fallback to Title/Author search if no book yet OR if the current book is poor/English
        const isPoorMetadata = (b: BookMetadata) => !b.description || !b.coverUrl || this.isEnglish(b.description)

        if (!book && title) {
            const titleSearch = await this.fetchGoogleByTitle(title, author || '')
            if (titleSearch) {
                book = titleSearch as BookMetadata
            }
        } else if (book && title && isPoorMetadata(book)) {
            const titleSearch = await this.fetchGoogleByTitle(title ?? book.title, author ?? book.authors[0])
            if (titleSearch) {
                // Keep the original clean ISBN but prioritize better metadata from title search
                book = { ...book, ...titleSearch }
            }
        }

        // 5. Try to improve with Inventaire (only if we have a plausible ISBN)
        if (searchIsbn.length >= 10 && (!book || isPoorMetadata(book))) {
            const invBook = await this.fetchInventaire(searchIsbn)
            if (invBook) {
                if (!book) book = { isbn: cleanIsbn, ...invBook } as any
                else {
                    book.description = book.description || invBook.description
                    book.coverUrl = book.coverUrl || invBook.coverUrl
                }
            }
        }

        // 6. Try OpenLibrary as a last resort
        if (searchIsbn.length >= 10 && (!book || isPoorMetadata(book))) {
            const olBook = await this.fetchOpenLibrary(searchIsbn)
            if (olBook) {
                if (!book) book = olBook
                else {
                    book.description = book.description || olBook.description
                    book.coverUrl = book.coverUrl || olBook.coverUrl
                }
            }
        }

        if (book) {
            // Ensure the ISBN we return is the normalized one (or original if not found better)
            book.isbn = book.isbn || cleanIsbn
        }
        return book
    }

    private normalizeIsbn(isbn: string): string {
        // Strip prefixes like WISH- or OL- to allow searching the real ISBN if contained
        let clean = isbn.replace(/^(WISH-|OL-)/i, '')
        // Normalize for search: keep only digits and X
        return clean.replace(/[^0-9X]/gi, '').toUpperCase()
    }

    private async fetchBNE(isbn: string): Promise<BookMetadata | null> {
        try {
            // Using a search query on datos.bne.es instead of direct resource URI for better reliability
            const url = `https://datos.bne.es/search?q=${isbn}`
            const response = await axios.get(url, {
                headers: {
                    'Accept': 'text/html',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                timeout: 20000 // Increased timeout to 20s for BNE as it is very slow
            })
            const html = response.data

            // Simple regex extraction for BNE portal
            // Title often inside <h2 class="title"> or <h1 class="item-title">
            const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
            const schemaTitle = html.match(/"name":\s*"([^"]+)"/) || html.match(/itemprop="name"[^>]*>([\s\S]*?)<\/span>/i)
            const schemaAuthor = html.match(/"author":\s*\[\s*{\s*"name":\s*"([^"]+)"/) || html.match(/schema:author[^>]*>([\s\S]*?)<\/a>/i) || html.match(/itemprop="author"[^>]*>([\s\S]*?)<\/span>/i)
            const coverMatch = html.match(/id="main-image"[^>]*src="([^"]+)"/i) || html.match(/itemprop="image"[^>]*src="([^"]+)"/i)

            if (titleMatch || schemaTitle) {
                let title = (schemaTitle ? schemaTitle[1] : titleMatch![1].split('|')[0]).trim()
                title = title.replace(/<[^>]*>/g, '').trim()

                // Avoid matching the ISBN itself as a title
                if (title.includes(isbn) && title.length < isbn.length + 5) return null

                return {
                    title: title,
                    authors: schemaAuthor ? [schemaAuthor[1].replace(/<[^>]*>/g, '').trim()] : [],
                    isbn: isbn,
                    coverUrl: coverMatch ? coverMatch[1] : undefined
                }
            }
        } catch (error: any) {
            console.warn(`[BNE Failed] ${error.message}`)
        }
        return null
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
            // Try with isbn: prefix first
            let url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${langParam}`
            let response = await axios.get(url, { timeout: 5000 })

            if (response.data.totalItems === 0) {
                // Try without isbn: prefix as a fallback
                url = `https://www.googleapis.com/books/v1/volumes?q=${isbn}${langParam}`
                response = await axios.get(url, { timeout: 5000 })
            }

            if (response.data.totalItems > 0 && response.data.items?.length > 0) {
                return this.mapGoogleBook(response.data.items[0].volumeInfo)
            }
        } catch (error: any) {
            console.warn(`Google Books (ISBN=${isbn}, esOnly=${esOnly}) failed:`, error.message)
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
            // Inventaire.io ISBN lookup - using 'isbn' parameter instead of 'value'
            const url = `https://inventaire.io/api/data?action=isbn&isbn=${isbn}`
            const response = await axios.get(url, { timeout: 5000 })

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
                        authors: info.claims?.P50 ? ['Autor Desconocido'] : [],
                        description: typeof description === 'string' ? description : description.value,
                        coverUrl: info.claims?.P18 ? `https://inventaire.io/img/entities/${info.claims.P18[0]}` : undefined
                    }
                }
            }
        } catch (error: any) {
            console.warn(`[Inventaire Failed] ${error.message}`)
        }
        return null
    }

    private async fetchOpenLibrary(isbn: string): Promise<BookMetadata | null> {
        try {
            const key = `ISBN:${isbn}`
            const url = `https://openlibrary.org/api/books?bibkeys=${key}&format=json&jscmd=data`
            const response = await axios.get(url, { timeout: 3000 })

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
        } catch (error: any) {
            console.warn(`[Open Library Failed] ${error.message}`)
        }
        return null
    }
}
