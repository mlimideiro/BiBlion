import axios from 'axios'
import https from 'https'
import { ScraperService } from './scraperService'
import { MetadataCache } from './metadataCache'

export interface BookMetadata {
    title: string
    authors: string[]
    publisher?: string
    pageCount?: number
    description?: string
    coverUrl?: string
    isbn?: string
}

export class MetadataService {
    private scraperService: ScraperService | null = null
    private cache = new MetadataCache()

    setScraperService(scraper: ScraperService) {
        this.scraperService = scraper
    }

    async lookup(isbn: string, title?: string, author?: string): Promise<BookMetadata | null> {
        const cleanIsbn = this.normalizeIsbn(isbn)
        const searchIsbn = cleanIsbn.toUpperCase()

        // 1. Check Cache first
        const cached = this.cache.get(searchIsbn)
        if (cached) return cached

        // If it's not a real ISBN-like string, we only do title search
        const isRealIsbn = searchIsbn.length >= 10 && searchIsbn.length <= 13 && /^[0-9X]+$/.test(searchIsbn)

        if (!isRealIsbn) {
            if (title) {
                const titleResult = await this.fetchGoogleByTitle(title, author || '')
                return titleResult as BookMetadata
            }
            return null
        }

        console.log(`[MetadataService] Overhauling lookup for ISBN: ${searchIsbn}`)
        let results: (BookMetadata | Partial<BookMetadata> | null)[] = []

        // --- Tiered Parallel Search ---

        // Tier 1: Fast & Reliable
        console.log('[MetadataService] Tier 1: Google + OpenLibrary')
        const tier1 = await Promise.allSettled([
            this.fetchGoogleBooks(searchIsbn, true),
            this.fetchOpenLibrary(searchIsbn)
        ])
        results.push(...tier1.map(r => r.status === 'fulfilled' ? (r as PromiseFulfilledResult<any>).value : null))

        // Check if Tier 1 is "good enough" (has title, author, and Spanish description)
        const bestTier1 = results.find(r => r && r.title && r.description && !this.isEnglish(r.description))
        if (bestTier1 && bestTier1.coverUrl) {
            const finalBook = { isbn: searchIsbn, ...bestTier1 } as BookMetadata
            this.cache.set(searchIsbn, finalBook)
            return finalBook
        }

        // Tier 2: Bookstore Scrapers (Regional focus)
        console.log('[MetadataService] Tier 2: Bookstore Scrapers')
        if (this.scraperService) {
            try {
                const scraped = await this.scraperService.findByIsbn(searchIsbn)
                if (scraped) {
                    results.push({
                        title: scraped.title,
                        authors: scraped.authors,
                        publisher: scraped.publisher,
                        description: scraped.description,
                        coverUrl: scraped.coverPath,
                        pageCount: scraped.pageCount
                    })
                }
            } catch (e) {
                console.warn('[MetadataService] Tier 2 error:', e)
            }
        }

        // Tier 3: BNE & Inventaire (Slow/Deep)
        console.log('[MetadataService] Tier 3: BNE + Inventaire')
        const tier3 = await Promise.allSettled([
            this.fetchBNE(searchIsbn),
            this.fetchInventaire(searchIsbn)
        ])
        results.push(...tier3.map(r => r.status === 'fulfilled' ? (r as PromiseFulfilledResult<any>).value : null))

        // --- Merge Results ---
        const merged = this.mergeResults(results as BookMetadata[], searchIsbn)

        if (merged) {
            // Final fallback: if merged has no description or is English, try title search as last resort
            if (!merged.description || this.isEnglish(merged.description)) {
                const searchTitle = merged.title || title || ''
                const searchAuthor = author || (merged.authors ? merged.authors[0] : '')
                
                if (searchTitle) {
                    // Try Google Books first
                    try {
                        const titleSearch = await this.fetchGoogleByTitle(searchTitle, searchAuthor)
                        if (titleSearch) {
                            merged.description = merged.description || titleSearch.description
                            merged.coverUrl = merged.coverUrl || titleSearch.coverUrl
                        }
                    } catch (e) {
                        console.warn('[MetadataService] Google Title search failed, trying OpenLibrary...')
                        const olTitleSearch = await this.fetchOpenLibraryByTitle(searchTitle, searchAuthor)
                        if (olTitleSearch) {
                            merged.description = merged.description || olTitleSearch.description
                            merged.coverUrl = merged.coverUrl || olTitleSearch.coverUrl
                        }
                    }
                }
            }

            const finalMerged = this.finalizeMetadata(merged)
            if (finalMerged && finalMerged.title && this.isErrorTitle(finalMerged.title)) {
                console.warn(`[MetadataService] Rejecting error title after merge: ${finalMerged.title}`)
                return null
            }

            this.cache.set(searchIsbn, finalMerged)
            return finalMerged
        }

        return null
    }

    private isErrorTitle(title: string): boolean {
        const lowerTitle = title.toLowerCase().trim()
        const errorKeywords = ['oops', '404', 'no se encontró', 'no se encontro', 'sin resultados', 'página no encontrada']
        return errorKeywords.some(kw => lowerTitle.includes(kw))
    }

    private finalizeMetadata(metadata: BookMetadata): BookMetadata {
        if (!metadata.title) return metadata
        
        let title = metadata.title.trim()
        
        // Remove "Libro " prefix
        title = title.replace(/^Libro\s+/i, '')
        
        // Remove trailing " de [Author]"
        if (metadata.authors && metadata.authors.length > 0) {
            for (const author of metadata.authors) {
                if (!author) continue
                const escapedAuthor = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                // Case insensitive match at the end
                const pattern = new RegExp(`\\s+de\\s+${escapedAuthor}$`, 'i')
                title = title.replace(pattern, '')
            }
        }
        
        // Greedy fallback for " de [Any Author Name]" if it starts with Libro
        // But only if we are confident it's an SEO title
        if (metadata.title.toLowerCase().startsWith('libro ') && title.toLowerCase().includes(' de ')) {
            title = title.replace(/^(.*)\s+de\s+.*?$/i, '$1')
        }

        // Clean common SEO suffixes
        title = title.replace(/\s*[|\-]\s*Cúspide.*$/i, '')
        title = title.replace(/\s*[|\-]\s*Tematika.*$/i, '')
        
        metadata.title = title.trim()
        return metadata
    }

    private async fetchOpenLibraryByTitle(title: string, author: string): Promise<Partial<BookMetadata> | null> {
        try {
            const query = `title=${encodeURIComponent(title)}${author ? `&author=${encodeURIComponent(author)}` : ''}`
            const url = `https://openlibrary.org/search.json?${query}&limit=3`
            const response = await axios.get(url, { timeout: 10000 })
            
            if (response.data.docs && response.data.docs.length > 0) {
                const best = response.data.docs[0]
                // Search result list in OL doesn't have description, need to fetch detail if available
                if (best.isbn && best.isbn.length > 0) {
                    return await this.fetchOpenLibrary(best.isbn[0])
                }
                return {
                    title: best.title,
                    authors: best.author_name || [],
                    publisher: best.publisher ? best.publisher[0] : undefined,
                    coverUrl: best.cover_i ? `https://covers.openlibrary.org/b/id/${best.cover_i}-L.jpg` : undefined
                }
            }
        } catch (e) {
            console.warn('[MetadataService] OpenLibrary Title Search failed:', e)
        }
        return null
    }

    private mergeResults(results: BookMetadata[], isbn: string): BookMetadata | null {
        const valid = results.filter(r => r && r.title)
        if (valid.length === 0) return null

        // 1. Pick the best title (prefer longer ones usually, but avoiding SEO spam)
        const titles = valid.map(r => r.title).sort((a, b) => b.length - a.length)
        const bestTitle = titles[0]

        // 2. Pick the best authors
        const authorsSet = new Set<string>()
        valid.forEach(r => r.authors?.forEach(a => authorsSet.add(a)))
        const bestAuthors = Array.from(authorsSet)

        // 3. Pick the best publisher (Prefer those from Argentina/Spain if detected)
        const publishers = valid.map(r => r.publisher).filter(Boolean)
        const argEsPublishers = ['planeta', 'sudamericana', 'alfaguara', 'debolsillo', 'galerna', 'nordica', 'siglo veintiuno', 'emece', 'tusquets']
        let bestPublisher = publishers[0]
        for (const p of publishers) {
            if (argEsPublishers.some(keyword => p!.toLowerCase().includes(keyword))) {
                bestPublisher = p
                break
            }
        }

        // 4. Pick the best description (Prefer Spanish and longest)
        const descriptions = valid.map(r => r.description).filter(Boolean) as string[]
        const spanishDescs = descriptions.filter(d => !this.isEnglish(d))
        const bestDescription = spanishDescs.sort((a, b) => b.length - a.length)[0] || descriptions.sort((a, b) => b.length - a.length)[0]

        // 5. Pick the best coverUrl
        // Prioritize bookstore covers over Google/OpenLibrary as they are usually better quality for local books
        const covers = valid.map(r => r.coverUrl).filter(Boolean) as string[]
        const bestCover = covers.find(c => c.includes('cuspide') || c.includes('mercadolibre') || c.includes('casadellibro')) 
                       || covers.find(c => c.includes('openlibrary'))
                       || covers[0]

        // 6. Max page count
        const pageCount = Math.max(...valid.map(r => r.pageCount || 0))

        return {
            isbn,
            title: bestTitle,
            authors: bestAuthors.length > 0 ? bestAuthors : [],
            publisher: bestPublisher,
            description: bestDescription,
            coverUrl: bestCover,
            pageCount: pageCount > 0 ? pageCount : undefined
        }
    }

    private normalizeIsbn(isbn: string): string {
        let clean = isbn.replace(/^(WISH-|OL-)/i, '')
        return clean.replace(/[^0-9X]/gi, '').toUpperCase()
    }

    private async fetchBNE(isbn: string): Promise<BookMetadata | null> {
        try {
            const url = `https://datos.bne.es/search?q=${isbn}`
            const response = await axios.get(url, {
                headers: {
                    'Accept': 'text/html',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                timeout: 10000 
            })
            const html = response.data

            const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
            const schemaTitle = html.match(/"name":\s*"([^"]+)"/) || html.match(/itemprop="name"[^>]*>([\s\S]*?)<\/span>/i)
            const schemaAuthor = html.match(/"author":\s*\[\s*{\s*"name":\s*"([^"]+)"/) || html.match(/schema:author[^>]*>([\s\S]*?)<\/a>/i) || html.match(/itemprop="author"[^>]*>([\s\S]*?)<\/span>/i)
            const coverMatch = html.match(/id="main-image"[^>]*src="([^"]+)"/i) || html.match(/itemprop="image"[^>]*src="([^"]+)"/i)

            if (titleMatch || schemaTitle) {
                let title = (schemaTitle ? schemaTitle[1] : titleMatch![1].split('|')[0]).trim()
                title = title.replace(/<[^>]*>/g, '').trim()

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
        return matches >= 2
    }

    private async fetchGoogleBooks(isbn: string, esOnly: boolean): Promise<BookMetadata | null> {
        try {
            const langParam = esOnly ? '&langRestrict=es' : ''
            let url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${langParam}`
            let response = await axios.get(url, { timeout: 10000 })

            if (response.data.totalItems === 0) {
                url = `https://www.googleapis.com/books/v1/volumes?q=${isbn}${langParam}`
                response = await axios.get(url, { timeout: 10000 })
            }

            if (response.data.totalItems > 0 && response.data.items?.length > 0) {
                return this.mapGoogleBook(response.data.items[0].volumeInfo)
            }
        } catch (error: any) {
            if (error.response && error.response.status === 429) {
                throw new Error('GOOGLE_429')
            }
            console.warn(`Google Books (ISBN=${isbn}) failed:`, error.message)
        }
        return null
    }

    private async fetchGoogleByTitle(title: string, author: string): Promise<Partial<BookMetadata> | null> {
        try {
            const query = `intitle:${encodeURIComponent(title)}${author ? `+inauthor:${encodeURIComponent(author)}` : ''}`
            const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&langRestrict=es&maxResults=3`
            const response = await axios.get(url)

            if (response.data.totalItems > 0 && response.data.items?.length > 0) {
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
            const url = `https://inventaire.io/api/data?action=isbn&isbn=${isbn}`
            const response = await axios.get(url, { timeout: 5000 })

            if (response.data && response.data.entities) {
                const entities = response.data.entities
                const firstKey = Object.keys(entities)[0]
                const info = entities[firstKey]

                if (info) {
                    const labels = info.labels || {}
                    const descriptions = info.descriptions || {}
                    const title = labels.es || labels.en || Object.values(labels)[0] || 'Sin Título'
                    const description = descriptions.es || descriptions.en || Object.values(descriptions)[0] || ''

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
            const response = await axios.get(url, { timeout: 10000 })

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
