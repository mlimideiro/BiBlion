import axios from 'axios'

export interface ScrapedData {
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
            const { data: html } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            })

            if (url.includes('cuspide.com')) {
                return this.parseCuspide(html)
            }
            if (url.includes('sbs.com.ar')) {
                return this.parseSBS(html)
            }
            if (url.includes('buscalibre')) {
                return this.parseBuscalibre(html)
            }
            if (url.includes('nordicalibros.com')) {
                return this.parseNordica(html)
            }

            // Universal Fallback (OpenGraph / Meta)
            return this.parseGeneric(html)
        } catch (error) {
            console.error('[ScraperService] Error scraping URL:', url, error)
            return null
        }
    }

    private parseCuspide(html: string): ScrapedData {
        const data: ScrapedData = {}

        // Title
        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        // Authors
        const authorMatch = html.match(/<a[^>]*itemprop="author"[^>]*>([\s\S]*?)<\/a>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        // Description
        const descMatch = html.match(/<div[^>]*class="resumen"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        // Cover
        const coverMatch = html.match(/<img[^>]*id="imgProducto"[^>]*src="([\s\S]*?)"/i)
        if (coverMatch) data.coverPath = coverMatch[1].startsWith('http') ? coverMatch[1] : `https://www.cuspide.com${coverMatch[1]}`

        // Meta data (Publisher, Pages)
        const metaMatch = html.match(/<div[^>]*class="caracteristicas"[^>]*>([\s\S]*?)<\/div>/i)
        if (metaMatch) {
            const metaHtml = metaMatch[1]
            const pubMatch = metaHtml.match(/Editorial:[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
            if (pubMatch) data.publisher = this.clean(pubMatch[1])

            const pagesMatch = metaHtml.match(/Número de páginas:[\s\S]*?<span>([\s\S]*?)<\/span>/i)
            if (pagesMatch) data.pageCount = parseInt(pagesMatch[1]) || 0
        }

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

        return data
    }

    private parseBuscalibre(html: string): ScrapedData {
        const data: ScrapedData = {}
        const titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/i)
        if (titleMatch) data.title = this.clean(titleMatch[1])

        const authorMatch = html.match(/<div[^>]*class="autor"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/itemprop="author"[\s\S]*?>([\s\S]*?)<\/a>/i)
        if (authorMatch) data.authors = [this.clean(authorMatch[1])]

        const descMatch = html.match(/<div[^>]*id="descripcion"[^>]*>([\s\S]*?)<\/div>/i)
        if (descMatch) data.description = this.clean(descMatch[1])

        const coverMatch = html.match(/<img[^>]*id="primaryimage"[^>]*src="([\s\S]*?)"/i)
        if (coverMatch) data.coverPath = coverMatch[1]

        const pubMatch = html.match(/Editorial:[\s\S]*?>([\s\S]*?)<\/a>/i)
        if (pubMatch) data.publisher = this.clean(pubMatch[1])

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

    private parseGeneric(html: string): ScrapedData {
        const data: ScrapedData = {}

        // OpenGraph Fallback
        const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([\s\S]*?)"/i)
        if (ogTitle) data.title = this.clean(ogTitle[1])

        const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([\s\S]*?)"/i)
        if (ogDesc) data.description = this.clean(ogDesc[1])

        const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([\s\S]*?)"/i)
        if (ogImage) data.coverPath = ogImage[1]

        // If no title found via OG, try standard <title>
        if (!data.title) {
            const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i)
            if (titleTag) data.title = this.clean(titleTag[1])
        }

        return data
    }

    private clean(text: string): string {
        return text
            .replace(/<[^>]*>/g, '') // remove tags
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    }
}
