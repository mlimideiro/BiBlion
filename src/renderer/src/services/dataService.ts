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

    async importBooks(username: string, books: Book[], mode: 'merge' | 'replace'): Promise<Book[]> {
        const res = await axios.post(`${API_BASE}/import`, { username, books, mode })
        return res.data
    },

    async repairMetadata(isbn: string, title?: string, author?: string) {
        // Metadata repair is essentially lookup on the API
        const res = await axios.get(`${API_BASE}/lookup/${encodeURIComponent(isbn)}`, {
            params: { title, author }
        })
        return res.data
    },

    async scrapeMetadata(url: string) {
        const res = await axios.get(`${API_BASE}/scrape`, { params: { url } })
        return res.data
    },

    async translateText(text: string): Promise<string | null> {
        try {
            const res = await axios.get(`${API_BASE}/translate`, { params: { text }, timeout: 10000 })
            return res.data?.translated || null
        } catch (e) {
            console.error('Translation error:', e)
            return null
        }
    },

    async renameCoverImage(username: string, oldIsbn: string, newIsbn: string): Promise<boolean> {
        try {
            const res = await axios.post(`${API_BASE}/covers/rename`, { username, oldIsbn, newIsbn })
            return res.data?.success || false
        } catch (e) {
            console.error('Rename cover error:', e)
            return false
        }
    },

    async uploadCover(username: string, isbn: string, imageData: string): Promise<string | null> {
        try {
            const res = await axios.post(`${API_BASE}/covers/upload`, { username, isbn, imageData })
            return res.data?.coverPath || null
        } catch (e) {
            console.error('Upload cover error:', e)
            return null
        }
    },

    getCoverUrl(book: Book) {
        if (!book.coverPath) return ''
        if (book.coverPath.startsWith('http')) return book.coverPath

        // Handle local:username:filename format (per-user cached covers)
        if (book.coverPath.startsWith('local:')) {
            const parts = book.coverPath.split(':')
            const username = parts[1]
            const filename = parts[2]
            return `${API_BASE}/covers/${username}/${filename}`
        }

        // Handle global:filename format
        if (book.coverPath.startsWith('global:')) {
            const filename = book.coverPath.split(':')[1]
            return `${API_BASE}/covers/shared/${filename}`
        }

        // Fallback: legacy global covers
        const filename = book.coverPath.split(/[/\\]/).pop()
        return `${API_BASE}/covers/${filename}`
    },

    async syncCovers(onProgress: (msg: string) => void) {
        const response = await fetch(`${API_BASE}/admin/sync-covers`, { method: 'POST' })
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) return

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            onProgress(chunk)
        }
    },

    async optimizeGlobalImages(onProgress: (msg: string) => void) {
        try {
            const response = await fetch(`${API_BASE}/admin/optimize-global-images`, { method: 'POST' })
            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) return

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                onProgress(decoder.decode(value))
            }
        } catch (e) {
            console.error('Optimize images error:', e)
            onProgress('Error crítico en el servidor.')
        }
    },

    async syncBarcodes(onProgress: (msg: string) => void) {
        try {
            const response = await fetch(`${API_BASE}/admin/sync-barcodes`, { method: 'POST' })
            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) return

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const chunk = decoder.decode(value, { stream: true })
                onProgress(chunk)
            }
        } catch (e) {
            console.error('Sync barcodes error:', e)
            onProgress('Error crítico en el servidor.')
        }
    },

    async getSharedCovers(): Promise<any[]> {
        try {
            const res = await axios.get(`${API_BASE}/admin/shared-covers`)
            return res.data
        } catch (e) {
            console.error('Get shared covers error:', e)
            return []
        }
    },

    async updateSharedCover(filename: string, data: { url?: string, imageData?: string }) {
        try {
            const res = await axios.post(`${API_BASE}/admin/shared-covers/update`, { filename, ...data })
            return res.data.success
        } catch (e) {
            console.error('Update shared cover error:', e)
            return false
        }
    },

    async exportBackup(username: string) {
        const url = `${API_BASE}/backup/export?username=${username}`
        const link = document.createElement('a')
        link.href = url
        link.download = `biblion_backup_${username}_${new Date().toISOString().split('T')[0]}.zip`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    },

    async importBackupZip(username: string, zipData: string, mode: 'merge' | 'replace'): Promise<Book[]> {
        const res = await axios.post(`${API_BASE}/backup/import`, { username, zipData, mode })
        return res.data.books
    }
}
