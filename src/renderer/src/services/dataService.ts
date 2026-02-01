import axios from 'axios'
import { Book, Config } from '../types'

const isElectron = !!(window as any).electron

// In mobile, we connect to the same host we were served from
const API_BASE = isElectron ? '' : `${window.location.origin}/api`

export const dataService = {
    async getBooks(username?: string): Promise<Book[]> {
        if (isElectron) {
            return window.electron.getBooks(username)
        }
        const res = await axios.get(`${API_BASE}/books`, { params: { username } })
        return res.data
    },

    async getConfig(username?: string): Promise<Config> {
        if (isElectron) {
            return window.electron.getConfig(username)
        }
        const res = await axios.get(`${API_BASE}/config`, { params: { username } })
        return res.data
    },

    async saveBook(book: Book, username?: string): Promise<any> {
        if (isElectron) {
            return window.electron.saveBook({ username, book })
        }
        // Merge username into body
        const res = await axios.post(`${API_BASE}/save`, { ...book, username })
        return res.data
    },

    async saveConfig(config: Config, username?: string): Promise<any> {
        if (isElectron) {
            return window.electron.saveConfig({ username, config })
        }
        const res = await axios.post(`${API_BASE}/config`, { ...config, username })
        return res.data
    },

    async deleteBook(isbn: string, username?: string): Promise<any> {
        if (isElectron) {
            return window.electron.deleteBook({ username, isbn })
        }
        // DELETE with body is tricky in some clients, but axios supports it via 'data' config
        const res = await axios.delete(`${API_BASE}/books/${isbn}`, { data: { username } })
        return res.data
    },

    async bulkSaveBooks(books: Book[], username?: string): Promise<Book[]> {
        if (isElectron) {
            return window.electron.bulkSaveBooks({ username, books })
        }
        const res = await axios.post(`${API_BASE}/bulk-save`, { username, books })
        return res.data
    },

    async bulkDeleteBooks(isbns: string[], username?: string): Promise<Book[]> {
        if (isElectron) {
            return window.electron.bulkDeleteBooks({ username, isbns })
        }
        const res = await axios.post(`${API_BASE}/bulk-delete`, { username, isbns })
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
