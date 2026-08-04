import axios from 'axios'

export interface ScrapedData {
    isbn?: string
    title?: string
    authors?: string[]
    description?: string
    coverPath?: string
    publisher?: string
    pageCount?: number
}

export class ScraperService {
    public async scrape(url: string): Promise<ScrapedData | null> {
        try {
            console.log(`[ScraperService] Scraping URL: ${url}`)
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 10000
            })
            const html = response.data
            const finalUrl = response.request?.res?.responseUrl || url

            let data: ScrapedData = {}

            if (finalUrl.includes('cuspide.com') || finalUrl.includes('galernaweb.com')) {
                data = this.parseStandardASPX(html, finalUrl)
            } else if (finalUrl.includes('sbs.com.ar')) {
                data = this.parseSBS(html)
            } else if (finalUrl.includes('buscalibre')) {
                data = this.parseBuscalibre(html)
            } else if (finalUrl.includes('tematika.com')) {
                data = this.parseTematika(html)
            } else if (finalUrl.includes('nordicalibros.com')) {
                data = this.parseNordica(html)
            } else if (finalUrl.includes('casadellibro.com')) {
                data = this.parseCasaDelLibro(html)
            } else if (finalUrl.includes('lecturalia.com')) {
                data = this.parseLecturalia(html)
            } else if (finalUrl.includes('mercadolibre.com')) {
                data = this.parseMercadoLibre(html, finalUrl)
            } else {
                data = this.parseGeneric(html)
            }

            // Fallback for missing fields using generic parser
            if (!data.title || !data.description || !data.coverPath) {
                const generic = this.parseGeneric(html)
                if (!data.title) data.title = generic.title
                if (!data.description) data.description = generic.description
                if (!data.coverPath) data.coverPath = generic.coverPath
                if (!data.isbn && generic.isbn) data.isbn = generic.isbn
            }

            // --- Intelligent Enhancements ---

            // 1. Try JSON-LD if metadata is missing or to confirm ISBN
            const jsonLdData = this.parseJsonLD(html)
            if (jsonLdData) {
                console.log('[ScraperService] Found JSON-LD data')
                data = { ...jsonLdData, ...data } // Prefer specialized parser for title/author, but JSON-LD is great for others
                if (jsonLdData.isbn && !data.isbn) data.isbn = jsonLdData.isbn
            }

            // 2. Extract ISBN from URL if not found in page
            if (!data.isbn) {
                const urlIsbn = this.extractIsbnFromUrl(url)
                if (urlIsbn) {
                    console.log(`[ScraperService] Extracted ISBN from URL: ${urlIsbn}`)
                    data.isbn = urlIsbn
                }
            }

            // 3. Fallback: Search Body for ISBN patterns if still missing
            if (!data.isbn) {
                const bodyIsbn = this.extractIsbnFromHtml(html)
                if (bodyIsbn) {
                    console.log(`[ScraperService] Found ISBN in page body: ${bodyIsbn}`)
                    data.isbn = bodyIsbn
                }
            }

            return data
        } catch (error) {
            console.error('[ScraperService] Error scraping URL:', url, error)
            return null
        }
    }

    public async findByIsbn(isbn: string): Promise<ScrapedData | null> {
        console.log(`[ScraperService] Searching bookstores in parallel for ISBN: ${isbn}`)

        const stores = [
            { name: 'Buscalibre', url: `https://www.buscalibre.com.ar/libros/search?q=${isbn}` },
            { name: 'Cuspide', url: `https://www.cuspide.com/resultados.aspx?c=${isbn}&por=isbn` },
            { name: 'SBS', url: `https://www.sbs.com.ar/resultados.aspx?c=${isbn}&por=isbn` },
            { name: 'CasaDelLibro', url: `https://www.casadellibro.com/buscar?q=${isbn}` },
            { name: 'Tematika', url: `https://www.tematika.com/catalogsearch/result/?q=${isbn}` },
            { name: 'Galerna', url: `https://www.galernaweb.com/resultados.aspx?c=${isbn}&por=isbn` },
            { name: 'Lecturalia', url: `https://www.lecturalia.com/search?q=${isbn}` },
            { name: 'MercadoLibre', url: `https://listado.mercadolibre.com.ar/${isbn}` }
        ]

        // Map each store to a promise
        const tasks: Promise<ScrapedData | null>[] = stores.map(async (store) => {
            try {
                // Add a small staggered delay to avoid instant spike but much faster than before
                const storeIdx = stores.indexOf(store)
                await new Promise(resolve => setTimeout(resolve, storeIdx * 400))
                
                const data = await this.scrape(store.url)
                if (data && this.isValidBookData(data)) {
                    console.log(`[ScraperService] Found on ${store.name}: ${data.title}`)
                    return { ...data, isbn }
                }
                return null
            } catch (e) {
                console.warn(`[ScraperService] Error searching ${store.name}:`, (e as Error).message)
                return null
            }
        })

        // Wait for all to settle
        const results = await Promise.allSettled(tasks)
        
        // Pick the best result (one with a cover and description if possible)
        const validResults = results
            .filter((r): r is PromiseFulfilledResult<ScrapedData | null> => r.status === 'fulfilled')
            .map(r => r.value)
            .filter((v): v is ScrapedData => v !== null)

        if (validResults.length === 0) return null

        // Sort by completeness
        validResults.sort((a, b) => {
            const score = (x: ScrapedData) => (x.coverPath ? 2 : 0) + (x.description ? 1 : 0) + (x.publisher ? 0.5 : 0)
            return score(b) - score(a)
        })

        return validResults[0]
    }

    private isValidBookData(data: ScrapedData): boolean {
        if (!data.title) return false

        if (this.isErrorTitle(data.title)) return false

        // A valid book from a bookstore search should ideally have an author or ISBN or cover
        // or a title that doesn't look like a generic search page
        if (data.title.length < 3) return false

        return true
    }

    private extractIsbnFromUrl(url: string): string | undefined {
        // Look for 13 or 10 digit sequences that seem like ISBNs
        const isbn13Match = url.match(/978\d{10}|979\d{10}/)
        if (isbn13Match) return isbn13Match[0]

        const isbn10Match = url.match(/\b\d{9}[\dX]\b/)
        if (isbn10Match) return isbn10Match[0]

        return undefined
    }

    private extractIsbnFromHtml(html: string): string | undefined {
        // Common patterns for ISBN label + number
        // Remove tags for body search to avoid catching IDs in script tags easily
        const cleanBody = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')

        const patterns = [
            /ISBN-13[:\s]+(97[89][-\s]?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,6}[-\s]?\d{1})/i,
            /ISBN[:\s]+(\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,6}[-\s]?[\dX])/i,
            /978\d{10}/,
            /979\d{10}/
        ]

        for (const pattern of patterns) {
            const match = cleanBody.match(pattern)
            if (match) {
                const clean = match[1] ? match[1].replace(/[-\s]/g, '') : match[0].replace(/[-\s]/g, '')
                if (clean.length === 10 || clean.length === 13) return clean
            }
        }
        return undefined
    }

    private parseJsonLD(html: string): ScrapedData | null {
        try {
            const matches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
            if (!matches) return null

            for (const scriptTag of matches) {
                const jsonContent = scriptTag.replace(/<script[^>]*>|<\/script>/gi, '').trim()
                try {
                    const json = JSON.parse(jsonContent)
                    // It can be a single object or an array of objects
                    const items = Array.isArray(json) ? json : (json['@graph'] || [json])

                    for (const item of items) {
                        const type = item['@type']
                        if (type === 'Book' || type === 'Product') {
                            const data: ScrapedData = {}
                            if (item.name) data.title = item.name
                            if (item.description) data.description = item.description
                            if (item.isbn) data.isbn = String(item.isbn).replace(/[-\s]/g, '')
                            if (item.publisher?.name) data.publisher = item.publisher.name

                            // Authors can be complex
                            if (item.author) {
                                const authors = Array.isArray(item.author) ? item.author : [item.author]
                                data.authors = authors.map((a: any) => a.name || a).filter(Boolean)
                            }

                            if (item.image) {
                                data.coverPath = Array.isArray(item.image) ? item.image[0] : (item.image.url || item.image)
                            }

                            return data
                        }
                    }
                } catch (e) { /* ignore single invalid script */ }
            }
        } catch (e) {
            console.error('[ScraperService] JSON-LD parse error', e)
        }
        return null
    }

    private parseStandardASPX(html: string, url: string): ScrapedData {
        const data: ScrapedData = {}
        const domain = new URL(url).origin

        // 1. Try Product Page Title
        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        // 2. Try Results List Title (Cuspide/SBS/Galerna)
        if (!data.title || this.isErrorTitle(data.title)) {
            const listMatch = html.match(/<a[^>]*class="nombre"[^>]*>([\s\S]*?)<\/a>/i) ||
                            html.match(/<div[^>]*class="nombre"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                            html.match(/<h2[^>]*class="title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
            if (listMatch) data.title = this.clean(listMatch[1])
        }

        // Authors
        const authorMatch = html.match(/<a[^>]*itemprop="author"[^>]*>([\s\S]*?)<\/a>/i) ||
            html.match(/Autor:[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
            html.match(/<div[^>]*class="autor"[^>]*>([\s\S]*?)<\/div>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        // Description
        const descMatch = html.match(/<div[^>]*class="resumen"[^>]*>([\s\S]*?)<\/div>/i) ||
            html.match(/<div[^>]*id="info"[^>]*>([\s\S]*?)<\/div>/i) ||
            html.match(/<div[^>]*class="description"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        // Cover
        const coverMatch = html.match(/<img[^>]*id="imgProducto"[^>]*src="([\s\S]*?)"/i) ||
            html.match(/<img[^>]*class="foto"[^>]*src="([\s\S]*?)"/i) ||
            html.match(/<img[^>]*class="cover"[^>]*src="([\s\S]*?)"/i) ||
            html.match(/<img[^>]*id="ctl00_CPH1_rptResultados_ctl00_imgTapa"[^>]*src="([\s\S]*?)"/i)

        if (coverMatch) {
            const src = coverMatch[1]
            data.coverPath = src.startsWith('http') ? src : `${domain}${src}`
        }

        // Meta data
        const pubMatch = html.match(/Editorial:[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
            html.match(/Editorial:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
        if (pubMatch) data.publisher = this.clean(pubMatch[1])

        const pagesMatch = html.match(/Número de páginas:[\s\S]*?<span>([\s\S]*?)<\/span>/i) ||
            html.match(/Páginas:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
        if (pagesMatch) data.pageCount = parseInt(pagesMatch[1]) || 0

        const isbnMatch = html.match(/ISBN:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
        if (isbnMatch) data.isbn = this.clean(isbnMatch[1]).replace(/[-\s]/g, '')

        return data
    }

    private parseSBS(html: string): ScrapedData {
        const data: ScrapedData = {}
        const titleMatch = html.match(/<h1[^>]*class="[^"]*productName[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        const authorMatch = html.match(/<a[^>]*class="[^"]*brandName[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        const descMatch = html.match(/<div[^>]*class="[^"]*productDescription[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        const coverMatch = html.match(/<img[^>]*id="image-main"[^>]*src="([\s\S]*?)"/i)
        if (coverMatch) data.coverPath = coverMatch[1]

        const pubMatch = html.match(/Editorial:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i)
        if (pubMatch) data.publisher = this.clean(pubMatch[1])

        const pagesMatch = html.match(/Páginas:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i)
        if (pagesMatch) data.pageCount = parseInt(pagesMatch[1]) || 0

        const isbnMatch = html.match(/ISBN:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i)
        if (isbnMatch) data.isbn = this.clean(isbnMatch[1]).replace(/[-\s]/g, '')

        return data
    }

    private parseBuscalibre(html: string): ScrapedData {
        const data: ScrapedData = {}
        const titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/i) ||
            html.match(/<h3[^>]*class="nombre"[^>]*>([\s\S]*?)<\/h3>/i) ||
            html.match(/<div[^>]*class="nombre"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
            
        if (titleMatch) {
            data.title = this.clean(titleMatch[1])
        }

        const authorMatch = html.match(/<div[^>]*class="autor"[^>]*>([\s\S]*?)<\/div>/i) ||
            html.match(/itemprop="author"[\s\S]*?>([\s\S]*?)<\/a>/i) ||
            html.match(/<div[^>]*class="author"[^>]*>([\s\S]*?)<\/div>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        // Clean title using authors if available
        if (data.title) {
            data.title = this.cleanTitle(data.title, data.authors)
        }

        const descMatch = html.match(/<div[^>]*id="descripcion"[^>]*>([\s\S]*?)<\/div>/i) ||
            html.match(/<div[^>]*class="sinopsis"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) {
            let desc = this.clean(descMatch[1])
            // Remove Buscalibre SEO suffix from descriptions
            const seoSuffix = /Libro\s+.*?\s+De\s+.*?\s+-\s+Buscalibre.*?$/i
            desc = desc.replace(seoSuffix, '').trim()
            data.description = desc
        }

        const coverMatch = html.match(/<img[^>]*id="primaryimage"[^>]*src="([\s\S]*?)"/i) ||
            html.match(/<img[^>]*class="box-foto"[^>]*src="([\s\S]*?)"/i) ||
            html.match(/<img[^>]*class="imagen-tapa"[^>]*src="([\s\S]*?)"/i)
        if (coverMatch) data.coverPath = coverMatch[1]

        const pubMatch = html.match(/Editorial:[\s\S]*?>([\s\S]*?)<\/a>/i) ||
            html.match(/data-editorial="([^"]+)"/i) ||
            html.match(/Editorial:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
        if (pubMatch) data.publisher = this.clean(pubMatch[1])

        return data
    }

    private parseTematika(html: string): ScrapedData {
        const data: ScrapedData = {}
        const titleMatch = html.match(/<h1[^>]*class="page-title"[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        const authorMatch = html.match(/<div[^>]*class="author"[^>]*>([\s\S]*?)<\/div>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        const descMatch = html.match(/<div[^>]*class="description"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        const coverMatch = html.match(/<img[^>]*class="gallery-placeholder__image"[^>]*src="([\s\S]*?)"/i)
        if (coverMatch) data.coverPath = coverMatch[1]

        const isbnMatch = html.match(/ISBN:[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)
        if (isbnMatch) data.isbn = this.clean(isbnMatch[1]).replace(/[-\s]/g, '')

        return data
    }

    private parseNordica(html: string): ScrapedData {
        const data: ScrapedData = {}
        const titleMatch = html.match(/<h1[^>]*class="product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        const authorMatch = html.match(/<div[^>]*class="item-autor"[^>]*>([\s\S]*?)<\/div>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        const descMatch = html.match(/<div[^>]*class="woocommerce-product-details__short-description"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        const coverMatch = html.match(/<img[^>]*class="wp-post-image"[^>]*src="([\s\S]*?)"/i)
        if (coverMatch) data.coverPath = coverMatch[1]

        return data
    }

    private parseCasaDelLibro(html: string): ScrapedData {
        const data: ScrapedData = {}

        // This targets CasaDelLibro's typical structure, but relies heavily on universal OpenGraph and schema
        // Title
        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<div[^>]*class="title"[^>]*>([\s\S]*?)<\/div>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        // Author
        const authorMatch = html.match(/<a[^>]*class="l-text-link l-text-link--standard d-inline-block[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || html.match(/Autor:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        // Description
        const descMatch = html.match(/<div[^>]*class="resume-text"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<div[^>]*class="synopsis"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        // Cover
        const coverMatch = html.match(/<img[^>]*class="picture-image"[^>]*src="([\s\S]*?)"/i) || html.match(/<img[^>]*class="book-image"[^>]*src="([\s\S]*?)"/i)
        if (coverMatch) data.coverPath = coverMatch[1]

        // Metadata
        const pubMatch = html.match(/Editorial:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
        if (pubMatch) data.publisher = this.clean(pubMatch[1])

        const pagesMatch = html.match(/Páginas:[\s\S]*?<span>([\s\S]*?)<\/span>/i) || html.match(/Nº de páginas:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
        if (pagesMatch) data.pageCount = parseInt(pagesMatch[1]) || 0

        return data
    }

    private parseLecturalia(html: string): ScrapedData {
        const data: ScrapedData = {}

        // Title
        const titleMatch = html.match(/<h1[^>]*class="titl"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        // Author
        const authorMatch = html.match(/<h2[^>]*class="au"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i) || html.match(/<a[^>]*itemprop="author"[^>]*>([\s\S]*?)<\/a>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        // Description
        const descMatch = html.match(/<div[^>]*id="sinopsis"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<div[^>]*class="resumen"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        // Cover
        const coverMatch = html.match(/<img[^>]*id="cover"[^>]*src="([\s\S]*?)"/i) || html.match(/<img[^>]*itemprop="image"[^>]*src="([\s\S]*?)"/i)
        if (coverMatch) {
            const src = coverMatch[1]
            data.coverPath = src.startsWith('http') ? src : `https://www.lecturalia.com${src}`
        }

        // Meta data
        const pubMatch = html.match(/Editorial:[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
        if (pubMatch) data.publisher = this.clean(pubMatch[1])

        const pagesMatch = html.match(/Páginas:[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)
        if (pagesMatch) data.pageCount = parseInt(pagesMatch[1]) || 0

        const isbnMatch = html.match(/ISBN:[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)
        if (isbnMatch) data.isbn = this.clean(isbnMatch[1]).replace(/[-\s]/g, '')

        return data
    }

    private parseMercadoLibre(html: string, url: string): ScrapedData {
        const data: ScrapedData = {}
        
        // ML can return a list or a product page
        // 1. Product Page (Catalogo)
        const titleMatch = html.match(/<h1[^>]*class="[^"]*ui-pdp-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) {
            data.title = this.clean(titleMatch[1])
            
            // Description
            const descMatch = html.match(/<p[^>]*class="[^"]*ui-pdp-description__content[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
            if (descMatch) data.description = this.clean(descMatch[1])
            
            // Cover
            const coverMatch = html.match(/<img[^>]*class="[^"]*ui-pdp-image[^"]*"[^>]*src="([^"]+)"/i) ||
                               html.match(/<img[^>]*class="[^"]*ui-pdp-gallery__figure__image[^"]*"[^>]*src="([^"]+)"/i)
            if (coverMatch) data.coverPath = coverMatch[1]
            
            // Metadata
            const tableMatch = html.match(/<table[^>]*class="[^"]*ui-vpp-striped-specs__table[^"]*"[\s\S]*?<\/table>/i) ||
                               html.match(/<table[^>]*class="[^"]*ui-pdp-specs__table[^"]*"[\s\S]*?<\/table>/i)
            if (tableMatch) {
                const pubMatch = tableMatch[0]?.match(/Editorial<\/th>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)
                if (pubMatch) data.publisher = this.clean(pubMatch[1])
                const authorMatch = tableMatch[0]?.match(/Autor<\/th>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)
                if (authorMatch) data.authors = [this.clean(authorMatch[1])]
            }
        } else {
            // 2. List Page - Use more generic class patterns
            const firstItemMatch = html.match(/<h2[^>]*class="[^"]*ui-search-item__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i) ||
                                  html.match(/<h2[^>]*class="[^"]*poly-box[^"]*poly-component__title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                                  html.match(/<h3[^>]*class="[^"]*ui-search-item__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i)
            if (firstItemMatch) {
                data.title = this.clean(firstItemMatch[1])
                
                const firstImageMatch = html.match(/<img[^>]*class="[^"]*ui-search-result-image__element[^"]*"[^>]*src="([^"]+)"/i) ||
                                     html.match(/<img[^>]*class="[^"]*poly-component__image[^"]*"[^>]*src="([^"]+)"/i) ||
                                     html.match(/<img[^>]*class="[^"]*ui-search-item__image[^"]*"[^>]*src="([^"]+)"/i)
                if (firstImageMatch) data.coverPath = firstImageMatch[1]
            }
        }

        return data
    }

    private isErrorTitle(title: string): boolean {
        const lowerTitle = title.toLowerCase().trim()
        
        const errorKeywords = [
            'oops', '404', 'no se encontró', 'no se encontro', 'sin resultados',
            'página no encontrada', 'pagina no encontrada', 'error de página',
            'resultados.aspx', 'busqueda.aspx', 'no se encontraron resultados',
            'acceso denegado', 'access denied', 'página solicitada no existe'
        ]
        
        if (errorKeywords.some(kw => lowerTitle.includes(kw))) return true
        
        // Exact matches for single words that are usually placeholders
        const exactErrors = ['error', 'oops', 'búsqueda', 'busqueda', 'resultados']
        if (exactErrors.includes(lowerTitle)) return true

        return false
    }

    private parseGeneric(html: string): ScrapedData {
        const data: ScrapedData = {}

        // OpenGraph Fallback
        const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([\s\S]*?)"/i)
        if (ogTitle) data.title = this.clean(ogTitle[1])

        const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([\s\S]*?)"/i)
        if (ogDesc) data.description = this.clean(ogDesc[1])

        const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([\s\S]*?)"/i)
        if (ogImage) data.coverPath = ogImage[1]

        const ogIsbn = html.match(/<meta[^>]*property="book:isbn"[^>]*content="([\s\S]*?)"/i)
        if (ogIsbn) data.isbn = this.clean(ogIsbn[1]).replace(/[-\s]/g, '')

        // If no title found via OG, try standard <title>
        if (!data.title) {
            const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i)
            if (titleTag) data.title = this.clean(titleTag[1])
        }

        return data
    }

    private clean(text: string): string {
        let cleaned = text
            .replace(/<[^>]*>/g, '') // remove tags
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

        // Globally strip common bookstore SEO suffixes from titles/descriptions
        const seoSpamPatterns = [
            /\s*[|\-]\s*Tematika\.com[\s\S]*$/i,
            /\s*[|\-]\s*Cúspide\.com[\s\S]*$/i,
            /\s*[|\-]\s*Cuspide\.com[\s\S]*$/i,
            /\s*[|\-]\s*Galerna[\s\S]*$/i,
            /\s*[|\-]\s*SBS[\s\S]*$/i,
            /\s*[|\-]\s*Lecturalia[\s\S]*$/i,
            /\s*[|\-]\s*Casa del Libro[\s\S]*$/i,
            /\s*[|\-]\s*Buscalibre[\s\S]*$/i
        ]

        for (const pattern of seoSpamPatterns) {
            cleaned = cleaned.replace(pattern, '')
        }

        return cleaned.trim()
    }
    private cleanTitle(title: string, authors: string[] = []): string {
        let cleaned = title
        
        // Remove "Libro " prefix
        cleaned = cleaned.replace(/^Libro\s+/i, '')
        
        // If it contains "Buscalibre", we know it's one of those SEO titles
        if (cleaned.toLowerCase().includes('buscalibre')) {
            // Try to find the last " de " before the author or before " - Buscalibre"
            // Use greedy match to handle "de" inside titles
            cleaned = cleaned.replace(/^(.*)\s+de\s+.*?\s*-\s*Buscalibre.*$/i, '$1')
        }

        // If we have authors, try to remove trailing " de [Author]"
        if (authors.length > 0) {
            for (const author of authors) {
                if (!author) continue
                const escapedAuthor = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const pattern = new RegExp(`\\s+de\\s+${escapedAuthor}$`, 'i')
                cleaned = cleaned.replace(pattern, '')
            }
        }
        
        // Final sanity check for remaining " de " at the end if it's very long
        // (Buscalibre titles often look like "Libro Título de Autor")
        if (title.toLowerCase().startsWith('libro ')) {
            cleaned = cleaned.replace(/^(.*)\s+de\s+.*?$/i, '$1')
        }

        return cleaned.trim()
    }
}
