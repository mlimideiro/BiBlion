import axios from 'axios'
import https from 'https'
import fs from 'fs-extra'
import path from 'path'
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

    private logLookup(message: string) {
        const line = `[${new Date().toISOString()}] ${message}`
        console.log(message)
        try {
            const logPath = path.join(process.cwd(), 'db_biblion', 'cache', 'lookup.log')
            fs.ensureDirSync(path.dirname(logPath))
            fs.appendFileSync(logPath, line + '\n')
        } catch { /* ignore log IO errors */ }
    }

    async lookup(isbn: string, title?: string, author?: string): Promise<BookMetadata | null> {
        const cleanIsbn = this.normalizeIsbn(isbn)
        const searchIsbn = cleanIsbn.toUpperCase()
        const started = Date.now()

        // 1. Check Cache first (ignore incomplete / poisoned hits)
        const cached = this.cache.get(searchIsbn)
        if (cached) {
            if (this.isCompleteEnough(cached, searchIsbn)) {
                this.logLookup(`[Lookup] CACHE HIT ${searchIsbn}: "${cached.title}"`)
                return cached
            }
            console.warn(`[MetadataService] Ignoring incomplete/bad cache for ${searchIsbn}: ${cached.title}`)
        }

        // If it's not a real ISBN-like string, we only do title search
        const isRealIsbn = searchIsbn.length >= 10 && searchIsbn.length <= 13 && /^[0-9X]+$/.test(searchIsbn)

        if (!isRealIsbn) {
            if (title) {
                const titleResult = await this.fetchGoogleByTitle(title, author || '')
                return titleResult as BookMetadata
            }
            return null
        }

        this.logLookup(`[Lookup] START ${searchIsbn}`)
        let results: (BookMetadata | Partial<BookMetadata> | null)[] = []

        // --- Tiered Parallel Search ---

        const isbnVariants = this.expandIsbnVariants(searchIsbn)

        // Tier 1: Fast & Reliable
        console.log('[MetadataService] Tier 1: Google + OpenLibrary')
        const tier1 = await Promise.allSettled([
            this.fetchGoogleBooks(searchIsbn, true),
            this.fetchOpenLibrary(searchIsbn),
            // ISBN-10 scans often need the ISBN-13 form in catalogs
            ...(isbnVariants[1] ? [
                this.fetchGoogleBooks(isbnVariants[1], true),
                this.fetchOpenLibrary(isbnVariants[1])
            ] : [])
        ])
        const tier1Values = tier1.map(r => r.status === 'fulfilled' ? (r as PromiseFulfilledResult<any>).value : null)
        results.push(...tier1Values)
        this.logLookup(`[Lookup] Tier1 ${searchIsbn}: ${tier1Values.map((r, i) => r?.title ? `#${i}="${r.title}"` : `#${i}=null`).join(', ')}`)

        // Early exit only with a complete hit (real title + author or cover)
        const bestTier1 = results.find(r =>
            r && this.isCompleteEnough(r, searchIsbn) && r.description && !this.isEnglish(r.description) && r.coverUrl
        )
        if (bestTier1) {
            const finalBook = this.finalizeMetadata({ isbn: searchIsbn, ...bestTier1 } as BookMetadata)
            if (this.isCompleteEnough(finalBook, searchIsbn)) {
                this.cache.set(searchIsbn, finalBook)
                this.logLookup(`[Lookup] OK tier1 ${searchIsbn} (${Date.now() - started}ms): "${finalBook.title}"`)
                return finalBook
            }
        }

        // Tier 2: Bookstore Scrapers (Regional focus)
        console.log('[MetadataService] Tier 2: Bookstore Scrapers')
        if (this.scraperService) {
            try {
                let scraped = await this.scraperService.findByIsbn(searchIsbn)
                if (!scraped && isbnVariants[1]) {
                    scraped = await this.scraperService.findByIsbn(isbnVariants[1])
                }
                if (scraped) {
                    const scrapedMeta: Partial<BookMetadata> = {
                        title: scraped.title,
                        authors: scraped.authors,
                        publisher: scraped.publisher,
                        description: scraped.description,
                        coverUrl: scraped.coverPath,
                        pageCount: scraped.pageCount,
                        isbn: scraped.isbn || searchIsbn
                    }
                    if (this.hasRealTitle(scrapedMeta, searchIsbn) && !this.isStorePromoText(scrapedMeta.description)) {
                        results.push(scrapedMeta)
                        this.logLookup(`[Lookup] Tier2 ${searchIsbn}: "${scrapedMeta.title}" authors=${scrapedMeta.authors?.length || 0} cover=${!!scrapedMeta.coverUrl}`)
                    } else {
                        this.logLookup(`[Lookup] Tier2 discard ${searchIsbn}: "${scraped.title}"`)
                    }
                } else {
                    this.logLookup(`[Lookup] Tier2 ${searchIsbn}: no store hit`)
                }
            } catch (e) {
                console.warn('[MetadataService] Tier 2 error:', e)
                this.logLookup(`[Lookup] Tier2 error ${searchIsbn}: ${(e as Error).message}`)
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
                const searchTitle = this.hasRealTitle(merged, searchIsbn) ? merged.title : (title || '')
                const searchAuthor = author || (merged.authors ? merged.authors[0] : '')

                if (searchTitle && !this.isIsbnLikeTitle(searchTitle, searchIsbn)) {
                    try {
                        const titleSearch = await this.fetchGoogleByTitle(searchTitle, searchAuthor)
                        if (titleSearch) {
                            merged.description = merged.description || titleSearch.description
                            merged.coverUrl = merged.coverUrl || titleSearch.coverUrl
                            if ((!merged.authors || merged.authors.length === 0) && titleSearch.authors?.length) {
                                merged.authors = titleSearch.authors
                            }
                        }
                    } catch (e) {
                        console.warn('[MetadataService] Google Title search failed, trying OpenLibrary...')
                        const olTitleSearch = await this.fetchOpenLibraryByTitle(searchTitle, searchAuthor)
                        if (olTitleSearch) {
                            merged.description = merged.description || olTitleSearch.description
                            merged.coverUrl = merged.coverUrl || olTitleSearch.coverUrl
                            if ((!merged.authors || merged.authors.length === 0) && olTitleSearch.authors?.length) {
                                merged.authors = olTitleSearch.authors
                            }
                        }
                    }
                }
            }

            const finalMerged = this.finalizeMetadata(merged)
            if (!this.isCompleteEnough(finalMerged, searchIsbn)) {
                this.logLookup(`[Lookup] REJECT incomplete ${searchIsbn} (${Date.now() - started}ms): title="${finalMerged?.title}", authors=${finalMerged?.authors?.length || 0}, cover=${!!finalMerged?.coverUrl}`)
                return null
            }

            this.cache.set(searchIsbn, finalMerged)
            this.logLookup(`[Lookup] OK merge ${searchIsbn} (${Date.now() - started}ms): "${finalMerged.title}"`)
            return finalMerged
        }

        this.logLookup(`[Lookup] MISS ${searchIsbn} (${Date.now() - started}ms)`)
        return null
    }

    /** Real title + (author OR cover). ISBN-as-title never counts. */
    private isCompleteEnough(meta: Partial<BookMetadata> | null | undefined, isbn?: string): boolean {
        if (!meta || !this.hasRealTitle(meta, isbn)) return false
        if (this.isStorePromoText(meta.description)) return false
        const hasAuthor = !!(meta.authors && meta.authors.some(a => !!a && a.trim().length > 1))
        const hasCover = !!(meta.coverUrl && String(meta.coverUrl).trim())
        return hasAuthor || hasCover
    }

    private hasRealTitle(meta: Partial<BookMetadata>, isbn?: string): boolean {
        if (!meta.title || meta.title.trim().length < 3) return false
        if (this.isErrorTitle(meta.title)) return false
        if (this.isIsbnLikeTitle(meta.title, isbn || meta.isbn)) return false
        return true
    }

    private isIsbnLikeTitle(title: string, isbn?: string): boolean {
        const trimmed = title.trim()
        const compact = trimmed.replace(/[\s\-]/g, '')
        // Pure ISBN-10 / ISBN-13
        if (/^\d{13}$/.test(compact) || /^\d{10}$/.test(compact) || /^\d{9}[\dX]$/i.test(compact)) return true

        if (isbn) {
            const normIsbn = isbn.replace(/[^0-9X]/gi, '').toUpperCase()
            const titleDigits = trimmed.replace(/[^0-9X]/gi, '').toUpperCase()
            if (titleDigits === normIsbn) return true
        }

        // "9789500731140 - Yenny - El Ateneo" after partial cleanup, or ISBN-only with junk
        if (/^\d{10,13}(\s*[-–|:].*)?$/i.test(trimmed) && trimmed.replace(/[^0-9]/g, '').length >= 10) {
            const nonDigit = trimmed.replace(/[\d\s\-–|:X]/gi, '')
            if (nonDigit.length < 3) return true
        }
        return false
    }

    private isErrorTitle(title: string): boolean {
        const lowerTitle = title.toLowerCase().trim()
        const errorKeywords = [
            'oops', '404', 'no se encontró', 'no se encontro', 'sin resultados',
            'página no encontrada', 'resultados de la búsqueda', 'resultados de la busqueda'
        ]
        if (errorKeywords.some(kw => lowerTitle.includes(kw))) return true

        const storeTitles = [
            'yenny - el ateneo', 'yenny', 'el ateneo', 'tematika', 'tematika.com',
            'cúspide', 'cuspide', 'galerna', 'casa del libro', 'lecturalia', 'mercado libre'
        ]
        if (storeTitles.includes(lowerTitle)) return true
        if (/^yenny\b/i.test(lowerTitle) && /el ateneo/i.test(lowerTitle)) return true
        if (/^\d{10,13}\s*[-–|:]\s*(yenny|tematika|cúspide|cuspide|galerna)/i.test(title)) return true
        if (this.isIsbnLikeTitle(title)) return true
        return false
    }

    private isStorePromoText(text?: string): boolean {
        if (!text) return false
        const lower = text.toLowerCase()
        return [
            'somos yenny',
            'retail de entretenimiento cultural',
            'yenny - el ateneo el retail',
            'en nuestro sitio podrás encontrar libros, música',
            'en nuestro sitio podr&aacute;s encontrar'
        ].some(kw => lower.includes(kw))
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
        title = title.replace(/\s*[|\-]\s*Yenny\s*[-–]\s*El Ateneo.*$/i, '')
        title = title.replace(/\s*[|\-]\s*Yenny.*$/i, '')
        title = title.replace(/\s*[|\-]\s*El Ateneo.*$/i, '')

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
        // Keep sources with a real title; completeness is checked after merge
        // so title from A + author/cover from B can still succeed.
        const valid = results.filter(r =>
            r && this.hasRealTitle(r, isbn) && !this.isStorePromoText(r.description)
        )
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

    private expandIsbnVariants(isbn: string): string[] {
        const variants = [isbn]
        if (isbn.length === 10) {
            const isbn13 = this.isbn10To13(isbn)
            if (isbn13) variants.push(isbn13)
        } else if (isbn.length === 13 && (isbn.startsWith('978') || isbn.startsWith('979'))) {
            const isbn10 = this.isbn13To10(isbn)
            if (isbn10) variants.push(isbn10)
        }
        return variants
    }

    private isbn10To13(isbn10: string): string | null {
        if (!/^\d{9}[\dX]$/i.test(isbn10)) return null
        const core = '978' + isbn10.slice(0, 9)
        let sum = 0
        for (let i = 0; i < 12; i++) {
            sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3)
        }
        const check = (10 - (sum % 10)) % 10
        return core + String(check)
    }

    private isbn13To10(isbn13: string): string | null {
        if (!/^978\d{10}$/.test(isbn13)) return null
        const core = isbn13.slice(3, 12)
        let sum = 0
        for (let i = 0; i < 9; i++) {
            sum += parseInt(core[i], 10) * (10 - i)
        }
        const rem = (11 - (sum % 11)) % 11
        const check = rem === 10 ? 'X' : String(rem)
        return core + check
    }

    private async fetchBNE(isbn: string): Promise<BookMetadata | null> {
        try {
            const url = `https://datos.bne.es/search?q=${isbn}`
            const response = await axios.get(url, {
                headers: {
                    'Accept': 'text/html',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8'
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
            const result = await this.queryGoogleBooksByIsbn(isbn, esOnly)
            if (result) return result

            // Many AR editions exist in Google but are not tagged as Spanish
            if (esOnly) {
                console.log(`[MetadataService] Google Books: no es hit for ${isbn}, retrying without langRestrict`)
                return await this.queryGoogleBooksByIsbn(isbn, false)
            }
        } catch (error: any) {
            if (error.message === 'GOOGLE_429' || (error.response && error.response.status === 429)) {
                throw new Error('GOOGLE_429')
            }
            console.warn(`Google Books (ISBN=${isbn}) failed:`, error.message)
        }
        return null
    }

    private async queryGoogleBooksByIsbn(isbn: string, esOnly: boolean): Promise<BookMetadata | null> {
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
        return null
    }

    private async fetchGoogleByTitle(title: string, author: string): Promise<Partial<BookMetadata> | null> {
        try {
            const query = `intitle:${encodeURIComponent(title)}${author ? `+inauthor:${encodeURIComponent(author)}` : ''}`
            const trySearch = async (esOnly: boolean) => {
                const langParam = esOnly ? '&langRestrict=es' : ''
                const url = `https://www.googleapis.com/books/v1/volumes?q=${query}${langParam}&maxResults=3`
                const response = await axios.get(url, { timeout: 10000 })
                if (response.data.totalItems > 0 && response.data.items?.length > 0) {
                    const items = response.data.items
                    const best = items.find((i: any) => i.volumeInfo.description) || items[0]
                    return this.mapGoogleBook(best.volumeInfo)
                }
                return null
            }

            return (await trySearch(true)) || (await trySearch(false))
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
