import axios from 'axios'
import { Book, Config } from '../types'

const API_BASE = '/api'

export const dataService = {
    async getBooks(username: string): Promise<Book[]> {
        const res = await axios.get(`${API_BASE}/books`, { params: { username } })
        return res.data
    },

    async getConfig(username: string): Promise<Config> {
        const res = await axios.get(`${API_BASE}/config`, { params: { username } })
        return res.data
    },

    async saveBook(username: string, book: Book): Promise<Book[]> {
        const res = await axios.post(`${API_BASE}/save`, { username, ...book })
        return res.data
    },

    async saveConfig(username: string, config: Config): Promise<Config> {
        const res = await axios.post(`${API_BASE}/config`, { username, ...config })
        return res.data
    },

    async deleteBook(username: string, isbn: string): Promise<Book[]> {
        const res = await axios.delete(`${API_BASE}/books/${isbn}`, { data: { username } })
        return res.data
    },

    async bulkSaveBooks(username: string, books: Book[]): Promise<Book[]> {
        const res = await axios.post(`${API_BASE}/bulk-save`, { username, books })
        return res.data
    },

    async bulkDeleteBooks(username: string, isbns: string[]): Promise<Book[]> {
        const res = await axios.post(`${API_BASE}/bulk-delete`, { username, isbns })
        return res.data
    },

    async repairMetadata(isbn: string) {
        // Metadata repair is essentially lookup on the API
        const res = await axios.get(`${API_BASE}/lookup/${isbn}`)
        return res.data
    },

    async scrapeMetadata(url: string) {
        const res = await axios.get(`${API_BASE}/scrape`, { params: { url } })
        return res.data
    },

    getCoverUrl(book: Book) {
        if (!book.coverPath) return ''
        if (book.coverPath.startsWith('http')) return book.coverPath

        // Return full API URL for local images
        const filename = book.coverPath.split(/[/\\]/).pop()
        return `${API_BASE}/covers/${filename}`
    }
}
