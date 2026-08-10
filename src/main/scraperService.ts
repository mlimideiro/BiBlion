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

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
}

interface StoreTarget {
    name: string
    urls: string[]
    followProduct?: boolean
    requireIsbnMatch?: boolean
    mode?: 'html' | 'sbs-vtex'
}

export class ScraperService {
    public async scrape(url: string): Promise<ScrapedData | null> {
        try {
            console.log(`[ScraperService] Scraping URL: ${url}`)
            const { html, finalUrl } = await this.fetchHtml(url)
            if (!html) return null
            return this.parsePage(html, finalUrl, url)
        } catch (error) {
            console.error('[ScraperService] Error scraping URL:', url, error)
            return null
        }
    }

    public async findByIsbn(isbn: string): Promise<ScrapedData | null> {
        console.log(`[ScraperService] Searching bookstores in parallel for ISBN: ${isbn}`)

        const stores: StoreTarget[] = [
            {
                name: 'SBS',
                urls: [],
                mode: 'sbs-vtex'
            },
            {
                name: 'Cuspide',
                urls: [
                    `https://www.cuspide.com/?s=${isbn}&post_type=product`,
                    `https://cuspide.com/?s=${isbn}&post_type=product`
                ],
                followProduct: true,
                requireIsbnMatch: true
            },
            {
                name: 'CasaDelLibro',
                urls: [`https://www.casadellibro.com/buscar?q=${isbn}`],
                followProduct: true
            },
            {
                name: 'Tematika',
                // Avoid homepage (?q=) — it returns store OG tags + unrelated featured products
                urls: [`https://www.tematika.com/search/?q=${isbn}`],
                followProduct: true,
                requireIsbnMatch: true
            },
            {
                name: 'Galerna',
                urls: [`https://www.galernaweb.com/search/?q=${isbn}`],
                followProduct: true,
                requireIsbnMatch: true
            },
            {
                name: 'Lecturalia',
                urls: [`https://www.lecturalia.com/search?q=${isbn}`],
                followProduct: true
            },
            {
                name: 'MercadoLibre',
                urls: [`https://listado.mercadolibre.com.ar/${isbn}`],
                followProduct: true
            }
        ]

        const tasks: Promise<ScrapedData | null>[] = stores.map(async (store, storeIdx) => {
            try {
                await new Promise(resolve => setTimeout(resolve, storeIdx * 350))
                const data = await this.searchStore(store, isbn)
                if (data && this.isValidBookData(data)) {
                    console.log(`[ScraperService] Found on ${store.name}: ${data.title}`)
                    return { ...data, isbn: data.isbn || isbn }
                }
                return null
            } catch (e) {
                console.warn(`[ScraperService] Error searching ${store.name}:`, (e as Error).message)
                return null
            }
        })

        const results = await Promise.allSettled(tasks)

        const validResults = results
            .filter((r): r is PromiseFulfilledResult<ScrapedData | null> => r.status === 'fulfilled')
            .map(r => r.value)
            .filter((v): v is ScrapedData => v !== null)

        if (validResults.length === 0) return null

        validResults.sort((a, b) => {
            const score = (x: ScrapedData) => (x.coverPath ? 2 : 0) + (x.description ? 1 : 0) + (x.publisher ? 0.5 : 0)
            return score(b) - score(a)
        })

        return validResults[0]
    }

    private async searchStore(store: StoreTarget, isbn: string): Promise<ScrapedData | null> {
        if (store.mode === 'sbs-vtex') {
            return this.fetchSbsByIsbn(isbn)
        }

        for (const url of store.urls) {
            const { html, finalUrl } = await this.fetchHtml(url)
            if (!html) continue

            let data = this.parsePage(html, finalUrl, url)
            if (data && this.isProductQuality(data) && this.isbnMatches(data, isbn, store.requireIsbnMatch)) {
                return data
            }

            if (store.followProduct) {
                const productUrls = this.extractProductLinks(html, finalUrl)
                for (const productUrl of productUrls.slice(0, 3)) {
                    if (productUrl === finalUrl || productUrl === url) continue
                    console.log(`[ScraperService] ${store.name}: following product link → ${productUrl}`)
                    const productData = await this.scrape(productUrl)
                    if (productData && this.isValidBookData(productData) && this.isbnMatches(productData, isbn, store.requireIsbnMatch)) {
                        return productData
                    }
                }
            }

            if (data && this.isValidBookData(data) && this.isbnMatches(data, isbn, store.requireIsbnMatch)) {
                return data
            }
        }
        return null
    }

    private isbnMatches(data: ScrapedData, isbn: string, required?: boolean): boolean {
        if (!required) return true
        if (!data.isbn) return false
        return data.isbn.replace(/[^0-9X]/gi, '').toUpperCase() === isbn.replace(/[^0-9X]/gi, '').toUpperCase()
    }

    private async fetchSbsByIsbn(isbn: string): Promise<ScrapedData | null> {
        const endpoints = [
            `https://www.sbs.com.ar/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${isbn}`,
            `https://www.sbs.com.ar/api/catalog_system/pub/products/search?ft=${isbn}`
        ]

        for (const url of endpoints) {
            try {
                console.log(`[ScraperService] SBS VTEX: ${url}`)
                const response = await axios.get(url, {
                    headers: {
                        ...BROWSER_HEADERS,
                        'Accept': 'application/json',
                        'Referer': 'https://www.sbs.com.ar/'
                    },
                    timeout: 10000
                })

                if (!Array.isArray(response.data) || response.data.length === 0) continue

                const p = response.data[0]
                const pick = (v: any): string | undefined => {
                    if (Array.isArray(v)) return v[0] != null ? String(v[0]) : undefined
                    return v != null ? String(v) : undefined
                }

                const title = pick(p.productName) || pick(p.productTitle)
                if (!title) continue

                const authorsRaw = p.Autor || p.brand
                const authors = Array.isArray(authorsRaw)
                    ? authorsRaw.map((a: any) => String(a)).filter(Boolean)
                    : (authorsRaw ? [String(authorsRaw)] : [])

                const pages = parseInt(pick(p['Cantidad de páginas']) || '0', 10) || undefined
                const coverPath = p.items?.[0]?.images?.[0]?.imageUrl as string | undefined

                return {
                    title,
                    authors,
                    publisher: pick(p.Editorial),
                    description: pick(p.Sinopsis) || pick(p.description) || pick(p.metaTagDescription),
                    coverPath,
                    pageCount: pages,
                    isbn: pick(p.ISBN) || isbn
                }
            } catch (e) {
                console.warn(`[ScraperService] SBS VTEX failed:`, (e as Error).message)
            }
        }
        return null
    }

    private async fetchHtml(url: string): Promise<{ html: string | null; finalUrl: string }> {
        try {
            const response = await axios.get(url, {
                headers: {
                    ...BROWSER_HEADERS,
                    'Referer': new URL(url).origin + '/'
                },
                timeout: 10000,
                maxRedirects: 5,
                validateStatus: (status) => status >= 200 && status < 400
            })
            const finalUrl = response.request?.res?.responseUrl || response.request?.responseURL || url
            return { html: typeof response.data === 'string' ? response.data : null, finalUrl }
        } catch (error) {
            console.warn(`[ScraperService] fetchHtml failed for ${url}:`, (error as Error).message)
            return { html: null, finalUrl: url }
        }
    }

    private parsePage(html: string, finalUrl: string, originalUrl: string): ScrapedData | null {
        let data: ScrapedData = {}

        if (finalUrl.includes('cuspide.com')) {
            // Cúspide migrated from ASPX to WooCommerce
            if (finalUrl.includes('/producto/') || html.includes('woocommerce') || html.includes('product_title')) {
                data = this.parseCuspideWoo(html)
            } else {
                data = this.parseStandardASPX(html, finalUrl)
            }
        } else if (finalUrl.includes('galernaweb.com')) {
            data = this.parseStandardASPX(html, finalUrl)
        } else if (finalUrl.includes('sbs.com.ar')) {
            data = this.parseSBS(html)
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

        if (!data.title || !data.description || !data.coverPath) {
            const generic = this.parseGeneric(html)
            // Never adopt storefront OG tags as book metadata
            if (!data.title && generic.title && !this.isErrorTitle(generic.title)) data.title = generic.title
            if (!data.description && generic.description && !this.isStorePromoText(generic.description)) {
                data.description = generic.description
            }
            if (!data.coverPath && generic.coverPath && !this.isStoreBrandCover(generic.coverPath, generic.title)) {
                data.coverPath = generic.coverPath
            }
            if (!data.isbn && generic.isbn) data.isbn = generic.isbn
        }

        const jsonLdData = this.parseJsonLD(html)
        if (jsonLdData) {
            console.log('[ScraperService] Found JSON-LD data')
            data = { ...jsonLdData, ...data }
            if (jsonLdData.isbn && !data.isbn) data.isbn = jsonLdData.isbn
        }

        if (!data.isbn) {
            const urlIsbn = this.extractIsbnFromUrl(originalUrl) || this.extractIsbnFromUrl(finalUrl)
            if (urlIsbn) {
                console.log(`[ScraperService] Extracted ISBN from URL: ${urlIsbn}`)
                data.isbn = urlIsbn
            }
        }

        if (!data.isbn) {
            const bodyIsbn = this.extractIsbnFromHtml(html)
            if (bodyIsbn) {
                console.log(`[ScraperService] Found ISBN in page body: ${bodyIsbn}`)
                data.isbn = bodyIsbn
            }
        }

        return data
    }

    private isProductQuality(data: ScrapedData): boolean {
        if (!data.title || this.isErrorTitle(data.title) || data.title.length < 3) return false
        return !!(data.coverPath || data.description || (data.authors && data.authors.length > 0))
    }

    private extractProductLinks(html: string, pageUrl: string): string[] {
        const origin = new URL(pageUrl).origin
        const found: string[] = []
        const patterns = [
            /href="(https?:\/\/(?:www\.)?cuspide\.com\/producto\/[^"]+)"/gi,
            /href="(\/producto\/[^"]+)"/gi,
            /<a[^>]*class="[^"]*nombre[^"]*"[^>]*href="([^"]+)"/gi,
            /<a[^>]*href="([^"]+)"[^>]*class="[^"]*nombre[^"]*"/gi,
            /href="([^"]*\/isbn\/[^"]+)"/gi,
            /href="([^"]*\/[Ll]ibro\/[^"]+)"/gi,
            /href="([^"]*\/productos\/[^"]+)"/gi,
            /<a[^>]*class="[^"]*product-item-link[^"]*"[^>]*href="([^"]+)"/gi,
            /<a[^>]*href="([^"]+)"[^>]*class="[^"]*product-item-link[^"]*"/gi,
            /<a[^>]*class="[^"]*ui-search-link[^"]*"[^>]*href="([^"]+)"/gi,
            /href="(https?:\/\/(?:www\.)?mercadolibre\.com\.ar\/[^"#]+)"/gi,
            /href="([^"]*\/libro-[^"]+)"/gi
        ]

        for (const pattern of patterns) {
            let match: RegExpExecArray | null
            while ((match = pattern.exec(html)) !== null) {
                let href = match[1].replace(/&amp;/g, '&').trim()
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue
                if (/\/feed\/?$/i.test(href)) continue
                if (/resultados\.aspx|buscar\?|\/search\?|catalogsearch\/result|listado\.mercadolibre|\?s=/i.test(href)) continue

                try {
                    const absolute = href.startsWith('http') ? href : new URL(href, origin).toString()
                    if (absolute === pageUrl) continue
                    if (!found.includes(absolute)) found.push(absolute)
                } catch {
                    continue
                }
            }
        }
        return found
    }

    private parseCuspideWoo(html: string): ScrapedData {
        const data: ScrapedData = {}

        const titleMatch = html.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        const authorMatch = html.match(/Autor[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        const descMatch = html.match(/<div[^>]*class="[^"]*woocommerce-product-details__short-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
            || html.match(/<div[^>]*id="tab-description"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        const coverMatch = html.match(/<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i)
            || html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)
        if (coverMatch) data.coverPath = coverMatch[1]

        const skuMatch = html.match(/<span[^>]*class="sku"[^>]*>([\s\S]*?)<\/span>/i)
        if (skuMatch) data.isbn = this.clean(skuMatch[1]).replace(/[-\s]/g, '')

        const pubMatch = html.match(/Editorial[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
            || html.match(/Editorial[:\s]*<\/[^>]+>[\s\S]*?<[^>]+>([\s\S]*?)<\//i)
        if (pubMatch) data.publisher = this.clean(pubMatch[1])

        const pagesMatch = html.match(/P[aá]ginas[:\s]*<\/[^>]+>[\s\S]*?<[^>]+>(\d+)/i)
            || html.match(/P[aá]ginas[:\s]+(\d+)/i)
        if (pagesMatch) data.pageCount = parseInt(pagesMatch[1], 10) || 0

        return data
    }

    private isValidBookData(data: ScrapedData): boolean {
        if (!data.title) return false
        if (this.isErrorTitle(data.title)) return false
        if (data.title.length < 3) return false
        if (data.description && this.isStorePromoText(data.description)) return false
        return true
    }

    private extractIsbnFromUrl(url: string): string | undefined {
        const isbn13Match = url.match(/978\d{10}|979\d{10}/)
        if (isbn13Match) return isbn13Match[0]

        const isbn10Match = url.match(/\b\d{9}[\dX]\b/)
        if (isbn10Match) return isbn10Match[0]

        return undefined
    }

    private extractIsbnFromHtml(html: string): string | undefined {
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
                    const items = Array.isArray(json) ? json : (json['@graph'] || [json])

                    for (const item of items) {
                        const type = item['@type']
                        if (type === 'Book' || type === 'Product') {
                            const data: ScrapedData = {}
                            if (item.name) data.title = item.name
                            if (item.description) data.description = item.description
                            if (item.isbn) data.isbn = String(item.isbn).replace(/[-\s]/g, '')
                            if (item.publisher?.name) data.publisher = item.publisher.name

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

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        if (!data.title || this.isErrorTitle(data.title)) {
            const listMatch = html.match(/<a[^>]*class="nombre"[^>]*>([\s\S]*?)<\/a>/i) ||
                            html.match(/<div[^>]*class="nombre"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                            html.match(/<h2[^>]*class="title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
            if (listMatch) data.title = this.clean(listMatch[1])
        }

        const authorMatch = html.match(/<a[^>]*itemprop="author"[^>]*>([\s\S]*?)<\/a>/i) ||
            html.match(/Autor:[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
            html.match(/<div[^>]*class="autor"[^>]*>([\s\S]*?)<\/div>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        const descMatch = html.match(/<div[^>]*class="resumen"[^>]*>([\s\S]*?)<\/div>/i) ||
            html.match(/<div[^>]*id="info"[^>]*>([\s\S]*?)<\/div>/i) ||
            html.match(/<div[^>]*class="description"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        const coverMatch = html.match(/<img[^>]*id="imgProducto"[^>]*src="([\s\S]*?)"/i) ||
            html.match(/<img[^>]*class="foto"[^>]*src="([\s\S]*?)"/i) ||
            html.match(/<img[^>]*class="cover"[^>]*src="([\s\S]*?)"/i) ||
            html.match(/<img[^>]*id="ctl00_CPH1_rptResultados_ctl00_imgTapa"[^>]*src="([\s\S]*?)"/i)

        if (coverMatch) {
            const src = coverMatch[1]
            data.coverPath = src.startsWith('http') ? src : `${domain}${src}`
        }

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

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<div[^>]*class="title"[^>]*>([\s\S]*?)<\/div>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        const authorMatch = html.match(/<a[^>]*class="l-text-link l-text-link--standard d-inline-block[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || html.match(/Autor:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        const descMatch = html.match(/<div[^>]*class="resume-text"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<div[^>]*class="synopsis"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        const coverMatch = html.match(/<img[^>]*class="picture-image"[^>]*src="([\s\S]*?)"/i) || html.match(/<img[^>]*class="book-image"[^>]*src="([\s\S]*?)"/i)
        if (coverMatch) data.coverPath = coverMatch[1]

        const pubMatch = html.match(/Editorial:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
        if (pubMatch) data.publisher = this.clean(pubMatch[1])

        const pagesMatch = html.match(/Páginas:[\s\S]*?<span>([\s\S]*?)<\/span>/i) || html.match(/Nº de páginas:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
        if (pagesMatch) data.pageCount = parseInt(pagesMatch[1]) || 0

        return data
    }

    private parseLecturalia(html: string): ScrapedData {
        const data: ScrapedData = {}

        const titleMatch = html.match(/<h1[^>]*class="titl"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        const authorMatch = html.match(/<h2[^>]*class="au"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i) || html.match(/<a[^>]*itemprop="author"[^>]*>([\s\S]*?)<\/a>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        const descMatch = html.match(/<div[^>]*id="sinopsis"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/<div[^>]*class="resumen"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        const coverMatch = html.match(/<img[^>]*id="cover"[^>]*src="([\s\S]*?)"/i) || html.match(/<img[^>]*itemprop="image"[^>]*src="([\s\S]*?)"/i)
        if (coverMatch) {
            const src = coverMatch[1]
            data.coverPath = src.startsWith('http') ? src : `https://www.lecturalia.com${src}`
        }

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

        const titleMatch = html.match(/<h1[^>]*class="[^"]*ui-pdp-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) {
            data.title = this.clean(titleMatch[1])

            const descMatch = html.match(/<p[^>]*class="[^"]*ui-pdp-description__content[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
            if (descMatch) data.description = this.clean(descMatch[1])

            const coverMatch = html.match(/<img[^>]*class="[^"]*ui-pdp-image[^"]*"[^>]*src="([^"]+)"/i) ||
                               html.match(/<img[^>]*class="[^"]*ui-pdp-gallery__figure__image[^"]*"[^>]*src="([^"]+)"/i)
            if (coverMatch) data.coverPath = coverMatch[1]

            const tableMatch = html.match(/<table[^>]*class="[^"]*ui-vpp-striped-specs__table[^"]*"[\s\S]*?<\/table>/i) ||
                               html.match(/<table[^>]*class="[^"]*ui-pdp-specs__table[^"]*"[\s\S]*?<\/table>/i)
            if (tableMatch) {
                const pubMatch = tableMatch[0]?.match(/Editorial<\/th>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)
                if (pubMatch) data.publisher = this.clean(pubMatch[1])
                const authorMatch = tableMatch[0]?.match(/Autor<\/th>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)
                if (authorMatch) data.authors = [this.clean(authorMatch[1])]
            }
        } else {
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
            'acceso denegado', 'access denied', 'página solicitada no existe',
            'resultados de la búsqueda', 'resultados de la busqueda'
        ]

        if (errorKeywords.some(kw => lowerTitle.includes(kw))) return true

        const exactErrors = ['error', 'oops', 'búsqueda', 'busqueda', 'resultados']
        if (exactErrors.includes(lowerTitle)) return true

        // Storefront / brand pages mistaken for books (Yenny homepage OG tags, etc.)
        const storeTitles = [
            'yenny - el ateneo', 'yenny', 'el ateneo', 'tematika', 'tematika.com',
            'cúspide', 'cuspide', 'cuspide.com', 'galerna', 'sbs', 'sbs librerías',
            'sbs librerias', 'casa del libro', 'lecturalia', 'mercado libre', 'mercadolibre'
        ]
        if (storeTitles.includes(lowerTitle)) return true
        if (/^yenny\b/i.test(lowerTitle) && /el ateneo/i.test(lowerTitle)) return true
        // "8428612404 - Yenny - El Ateneo" / "ISBN | Tematika"
        if (/^\d{10,13}\s*[-–|:]\s*(yenny|tematika|cúspide|cuspide|galerna|sbs|casa del libro)/i.test(title)) return true

        return false
    }

    private isStorePromoText(text: string): boolean {
        const lower = text.toLowerCase()
        return [
            'somos yenny',
            'retail de entretenimiento cultural',
            'yenny - el ateneo el retail',
            'en nuestro sitio podrás encontrar libros, música',
            'en nuestro sitio podr&aacute;s encontrar',
            'la librería más grande',
            'comprá online en'
        ].some(kw => lower.includes(kw))
    }

    private isStoreBrandCover(coverUrl: string, title?: string): boolean {
        if (title && this.isErrorTitle(title)) return true
        const lower = coverUrl.toLowerCase()
        return /logo|favicon|placeholder|default[-_]?cover|yenny|ateneo[-_]?logo/i.test(lower)
    }

    private parseGeneric(html: string): ScrapedData {
        const data: ScrapedData = {}

        const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([\s\S]*?)"/i)
        if (ogTitle) data.title = this.clean(ogTitle[1])

        const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([\s\S]*?)"/i)
        if (ogDesc) data.description = this.clean(ogDesc[1])

        const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([\s\S]*?)"/i)
        if (ogImage) data.coverPath = ogImage[1]

        const ogIsbn = html.match(/<meta[^>]*property="book:isbn"[^>]*content="([\s\S]*?)"/i)
        if (ogIsbn) data.isbn = this.clean(ogIsbn[1]).replace(/[-\s]/g, '')

        if (!data.title) {
            const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i)
            if (titleTag) data.title = this.clean(titleTag[1])
        }

        return data
    }

    private clean(text: string): string {
        let cleaned = text
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&apos;/gi, "'")
            .replace(/&aacute;/gi, 'á')
            .replace(/&eacute;/gi, 'é')
            .replace(/&iacute;/gi, 'í')
            .replace(/&oacute;/gi, 'ó')
            .replace(/&uacute;/gi, 'ú')
            .replace(/&ntilde;/gi, 'ñ')
            .replace(/&Aacute;/g, 'Á')
            .replace(/&Eacute;/g, 'É')
            .replace(/&Iacute;/g, 'Í')
            .replace(/&Oacute;/g, 'Ó')
            .replace(/&Uacute;/g, 'Ú')
            .replace(/&Ntilde;/g, 'Ñ')
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
            .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/\s+/g, ' ')
            .trim()

        const seoSpamPatterns = [
            /\s*[|\-]\s*Tematika\.com[\s\S]*$/i,
            /\s*[|\-]\s*Yenny\s*[-–]\s*El Ateneo[\s\S]*$/i,
            /\s*[|\-]\s*Cúspide\.com[\s\S]*$/i,
            /\s*[|\-]\s*Cuspide\.com[\s\S]*$/i,
            /\s*[|\-]\s*Galerna[\s\S]*$/i,
            /\s*[|\-]\s*SBS[\s\S]*$/i,
            /\s*[|\-]\s*Lecturalia[\s\S]*$/i,
            /\s*[|\-]\s*Casa del Libro[\s\S]*$/i
        ]

        for (const pattern of seoSpamPatterns) {
            cleaned = cleaned.replace(pattern, '')
        }

        return cleaned.trim()
    }

    private cleanTitle(title: string, authors: string[] = []): string {
        let cleaned = title

        cleaned = cleaned.replace(/^Libro\s+/i, '')

        if (authors.length > 0) {
            for (const author of authors) {
                if (!author) continue
                const escapedAuthor = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const pattern = new RegExp(`\\s+de\\s+${escapedAuthor}$`, 'i')
                cleaned = cleaned.replace(pattern, '')
            }
        }

        return cleaned.trim()
    }
}
