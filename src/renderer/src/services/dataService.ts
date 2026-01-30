import axios from 'axios'
import { Book, Config } from '../types'

const isElectron = !!(window as any).electron

// In mobile, we connect to the same host we were served from
const API_BASE = isElectron ? '' : `${window.location.origin}/api`

export const dataService = {
    async getBooks(): Promise<Book[]> {
        if (isElectron) {
            return window.electron.getBooks()
        }
        const res = await axios.get(`${API_BASE}/books`)
        return res.data
    },

    async getConfig(): Promise<Config> {
        if (isElectron) {
            return window.electron.getConfig()
        }
        const res = await axios.get(`${API_BASE}/config`)
        return res.data
    },

    async saveBook(book: Book): Promise<any> {
        if (isElectron) {
            return window.electron.saveBook(book)
        }
        const res = await axios.post(`${API_BASE}/save`, book)
        return res.data
    },

    async saveConfig(config: Config): Promise<any> {
        if (isElectron) {
            return window.electron.saveConfig(config)
        }
        const res = await axios.post(`${API_BASE}/config`, config)
        return res.data
    },

    async deleteBook(isbn: string): Promise<any> {
        if (isElectron) {
            return window.electron.deleteBook(isbn)
        }
        const res = await axios.delete(`${API_BASE}/books/${isbn}`)
        return res.data
    },

    async bulkSaveBooks(books: Book[]): Promise<Book[]> {
        if (isElectron) {
            return window.electron.bulkSaveBooks(books)
        }
        const res = await axios.post(`${API_BASE}/bulk-save`, books)
        return res.data
    },

    async bulkDeleteBooks(isbns: string[]): Promise<Book[]> {
        if (isElectron) {
            return window.electron.bulkDeleteBooks(isbns)
        }
        const res = await axios.post(`${API_BASE}/bulk-delete`, isbns)
        return res.data
    },

    async repairMetadata(isbn: string) {
        if (isElectron) {
            return window.electron.repairMetadata(isbn)
        }
        // Metadata repair is essentially lookup on the API
        const res = await axios.get(`${API_BASE}/lookup/${isbn}`)
        return res.data
    },

    async scrapeMetadata(url: string) {
        if (isElectron) {
            return window.electron.scrapeMetadata(url)
        }
        const res = await axios.get(`${API_BASE}/scrape`, { params: { url } })
        return res.data
    },

    getCoverUrl(book: Book): string {
        // 1. If we have a local path...
        if (book.coverPath) {
            // Already a remote URL?
            if (book.coverPath.startsWith('http')) return book.coverPath

            // Local file in Electron
            if (isElectron) return `file://${book.coverPath}`

            // Local file in Web via API
            const filename = book.coverPath.split(/[\\/]/).pop()
            return `${API_BASE}/covers/${filename}`
        }

        // 2. Fallback to remote URL if available
        if (book.coverUrl) return book.coverUrl

        return ''
    }
}
