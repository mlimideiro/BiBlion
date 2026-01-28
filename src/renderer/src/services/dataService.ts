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
        // Delete not yet implemented via API
        return null
    },

    async bulkSaveBooks(books: Book[]): Promise<Book[]> {
        if (isElectron) {
            return window.electron.bulkSaveBooks(books)
        }
        // Bulk save not yet implemented via API
        return []
    },

    async bulkDeleteBooks(isbns: string[]): Promise<Book[]> {
        if (isElectron) {
            return window.electron.bulkDeleteBooks(isbns)
        }
        // Bulk delete not yet implemented via API
        return []
    },

    async repairMetadata(isbn: string) {
        if (isElectron) {
            return window.electron.repairMetadata(isbn)
        }
        return null // Repair usually happens on PC
    },

    async scrapeMetadata(url: string) {
        if (isElectron) {
            return window.electron.scrapeMetadata(url)
        }
        return null // Scrape usually happens on PC
    },

    getCoverUrl(book: Book): string {
        if (!book.coverPath) return ''
        if (book.coverPath.startsWith('http')) return book.coverPath

        if (isElectron) {
            return `file://${book.coverPath}`
        }

        // For mobile, we serve local covers via a specific endpoint
        const filename = book.coverPath.split(/[\\/]/).pop()
        return `${API_BASE}/covers/${filename}`
    }
}
