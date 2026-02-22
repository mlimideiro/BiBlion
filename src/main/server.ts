import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import fsExtra from 'fs-extra'
import ip from 'ip'
import axios from 'axios'
import { DataManager, Book } from './dataManager'
import { MetadataService } from './metadataService'
import { ScraperService } from './scraperService'

export function startServer(
    dataManager: DataManager,
    metadataService: MetadataService,
    scraperService: ScraperService,
    onBookUpdate: (username: string, book: Book) => void
) {
    const app = express()
    const PORT = 3000

    app.use(express.json())
    app.use(cors())

    const USERS_FILE = path.join(process.cwd(), 'db_biblion', 'users.json')

    app.post('/api/login', (req, res) => {
        const { username, password } = req.body
        console.log('[Server API Login Attempt]', { username })

        // 1. Check for Superadmin
        if (username === 'superadmin_mlimideiro' && password === '!MeGustaElCafe!@2011') {
            return res.json({ success: true, username: 'SuperAdmin', isAdmin: true })
        }

        try {
            if (!fs.existsSync(USERS_FILE)) {
                return res.status(500).json({ error: 'Configuración de usuarios no encontrada' })
            }
            const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
            const user = users.find((u: any) => u.username === username && u.password === password)

            if (user) {
                res.json({ success: true, username: user.username })
            } else {
                res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos' })
            }
        } catch (error) {
            res.status(500).json({ error: 'Error en el servidor' })
        }
    })

    const staticPath = path.join(__dirname, '../renderer')

    // CRITICAL FIX: Disable default index.html serving to avoid serving desktop app to mobile
    app.use(express.static(staticPath, { index: false }))

    // Explicitly serve mobile.html for root request
    app.get('/', (_req, res) => {
        res.sendFile(path.join(staticPath, 'mobile.html'))
    })

    // Route for the full desktop management view
    app.get('/desktop', (_req, res) => {
        res.sendFile(path.join(staticPath, 'index.html'))
    })

    // Explicit fallback for /mobile.html if requested directly
    app.get('/mobile.html', (_req, res) => {
        res.sendFile(path.join(staticPath, 'mobile.html'))
    })

    app.get('/api/books', (req, res) => {
        const { username } = req.query
        const books = dataManager.getAllBooks(username as string)
        res.json(books)
    })

    app.get('/api/config', (req, res) => {
        const { username } = req.query
        const config = dataManager.getConfig(username as string)
        res.json(config)
    })

    app.get('/api/covers/:username/:filename', (req, res) => {
        const { username, filename } = req.params
        const filePath = path.join(process.cwd(), 'db_biblion', 'users', username, 'covers', filename)
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath)
        } else {
            res.status(404).send('Cover not found')
        }
    })

    app.get('/api/covers/:filename', (req, res) => {
        const { filename } = req.params
        const filePath = path.join(process.cwd(), 'db_biblion', 'covers', filename)
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath)
        } else {
            res.status(404).send('Cover not found')
        }
    })

    app.get('/api/lookup/:isbn', async (req, res) => {
        const { isbn } = req.params
        const { title, author } = req.query
        console.log(`[Lookup] ISBN: ${isbn}, Title: ${title || '(none)'}, Author: ${author || '(none)'}`)

        try {
            const metadata = await metadataService.lookup(isbn, title as string, author as string)
            if (metadata) {
                console.log(`[Lookup Success] Found: ${metadata.title}`)
                res.json(metadata)
            } else {
                console.warn(`[Lookup Failed] No results for ISBN: ${isbn}`)
                res.status(404).json({ error: 'Book not found' })
            }
        } catch (error) {
            console.error('[Lookup Error]', error)
            res.status(500).json({ error: 'Internal server error during lookup' })
        }
    })

    // Helper: download external cover to per-user local storage (fire & forget)
    const downloadCoverToLocal = (username: string, isbn: string, coverUrl: string) => {
        if (!coverUrl || !coverUrl.startsWith('http')) return
        const cleanIsbn = isbn.replace(/[^a-zA-Z0-9]/g, '')
        const coversDir = path.join(process.cwd(), 'db_biblion', 'users', username, 'covers')
        const localFilename = `${cleanIsbn}.jpg`
        const localPath = path.join(coversDir, localFilename)
        if (fs.existsSync(localPath)) return // Already cached

        axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 15000 })
            .then(response => {
                fsExtra.ensureDirSync(coversDir)
                fs.writeFileSync(localPath, Buffer.from(response.data))
                // Update the book: preserve original URL in coverUrl, switch coverPath to local
                const books = dataManager.getAllBooks(username)
                const idx = books.findIndex(b => b.isbn.replace(/[^a-zA-Z0-9]/g, '') === cleanIsbn)
                if (idx >= 0) {
                    books[idx].coverUrl = coverUrl  // Preserve original for backup/restore
                    books[idx].coverPath = `local:${username}:${localFilename}`
                    const userDir = path.join(process.cwd(), 'db_biblion', 'users', username)
                    const booksFile = path.join(userDir, 'books.json')
                    fsExtra.writeJsonSync(booksFile, books, { spaces: 2 })
                    console.log(`[Cover] Cached locally for ${username}/${cleanIsbn}`)
                }
            })
            .catch(e => console.warn(`[Cover] Download failed for ${isbn}:`, e.message))
    }

    app.post('/api/save', (req, res) => {
        const { username, ...bookData } = req.body
        console.log(`[Server] Save request for ${username}: "${bookData.title}" (ISBN: ${bookData.isbn})`)

        try {
            const newBook: Book = {
                ...bookData,
                createdAt: bookData.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }

            dataManager.saveBook(username, newBook)
            onBookUpdate(username, newBook)

            // Background cover download
            if (newBook.coverPath?.startsWith('http')) {
                downloadCoverToLocal(username, newBook.isbn, newBook.coverPath)
            }

            const allBooks = dataManager.getAllBooks(username)
            res.json(allBooks)
        } catch (error) {
            console.error(`[Server] Error saving book for ${username}:`, error)
            res.status(500).json({ error: (error as Error).message })
        }
    })

    app.post('/api/bulk-save', (req, res) => {
        const { username, books } = req.body
        console.log(`[Server] Bulk save request for ${username}: ${books?.length} books`)

        try {
            if (username && books) {
                dataManager.saveBooks(username, books)
                res.json(dataManager.getAllBooks(username))
            } else {
                res.status(400).json({ error: "Invalid format: username and books are required" })
            }
        } catch (error) {
            console.error(`[Server] Error in bulk-save for ${username}:`, error)
            res.status(500).json({ error: (error as Error).message })
        }
    })

    app.post('/api/bulk-delete', (req, res) => {
        const { username, isbns } = req.body
        console.log(`[Server] Bulk delete request for ${username}: ${isbns?.length} isbns`)
        try {
            if (username && isbns) {
                dataManager.deleteBooks(username, isbns)
                res.json(dataManager.getAllBooks(username))
            } else {
                res.status(400).json({ error: "Invalid format: username and isbns are required" })
            }
        } catch (error) {
            console.error(`[Server] Error in bulk-delete for ${username}:`, error)
            res.status(500).json({ error: (error as Error).message })
        }
    })

    app.post('/api/import', (req, res) => {
        const { username, books, mode } = req.body
        console.log(`[Server] Import request for ${username}: ${books?.length} books, mode: ${mode}`)
        try {
            if (username && books && (mode === 'merge' || mode === 'replace')) {
                const updatedBooks = dataManager.importBooks(username, books, mode)
                res.json(updatedBooks)

                // Background: re-download covers for imported books that have coverUrl
                const allBooks = dataManager.getAllBooks(username)
                let delay = 0
                for (const book of allBooks) {
                    const url = book.coverUrl || (book.coverPath?.startsWith('http') ? book.coverPath : null)
                    if (url) {
                        setTimeout(() => downloadCoverToLocal(username, book.isbn, url), delay)
                        delay += 500 // Stagger downloads to avoid overwhelming servers
                    }
                }
                if (delay > 0) console.log(`[Import] Queued cover downloads for ${Math.floor(delay / 500)} books`)
            } else {
                res.status(400).json({ error: "Invalid format: username, books, and valid mode (merge/replace) are required" })
            }
        } catch (error) {
            console.error(`[Server] Error in import for ${username}:`, error)
            res.status(500).json({ error: (error as Error).message })
        }
    })

    app.delete('/api/books/:isbn', (req, res) => {
        const { isbn } = req.params
        const username = req.body.username || req.query.username || ''

        console.log(`[Server] Delete request for ${username}: ISBN ${isbn}`)
        try {
            const success = dataManager.deleteBook(username as string, isbn)

            if (success) {
                const allBooks = dataManager.getAllBooks(username as string)
                res.json(allBooks)
            } else {
                res.status(404).json({ error: 'Book not found' })
            }
        } catch (error) {
            console.error(`[Server] Error deleting book for ${username}:`, error)
            res.status(500).json({ error: (error as Error).message })
        }
    })

    app.post('/api/config', (req, res) => {
        const { username, ...configData } = req.body
        console.log('Updating config from mobile/web', username)
        dataManager.saveConfig(username, configData)
        res.json({ success: true })
    })

    app.get('/api/scrape', async (req, res) => {
        const { url } = req.query
        if (!url) return res.status(400).json({ error: 'URL is required' })
        console.log('Scraping URL:', url)
        const result = await scraperService.scrape(url as string)
        res.json(result)
    })

    app.get('/api/translate', async (req, res) => {
        const { text } = req.query
        if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text is required' })

        try {
            // Split text into ≤500 char chunks on sentence boundaries
            const MAX = 490
            const chunks: string[] = []
            let remaining = text.trim()
            while (remaining.length > 0) {
                if (remaining.length <= MAX) {
                    chunks.push(remaining)
                    break
                }
                // Try to split at last sentence boundary (. ! ?) before MAX
                let cutAt = remaining.lastIndexOf('. ', MAX)
                if (cutAt < 100) cutAt = remaining.lastIndexOf(' ', MAX)
                if (cutAt < 10) cutAt = MAX
                chunks.push(remaining.slice(0, cutAt + 1).trim())
                remaining = remaining.slice(cutAt + 1).trim()
            }

            const translatedParts: string[] = []
            for (const chunk of chunks) {
                const response = await axios.get(`https://api.mymemory.translated.net/get`, {
                    params: { q: chunk, langpair: 'en|es' },
                    timeout: 10000
                })
                const part = response.data?.responseData?.translatedText
                if (part) translatedParts.push(part)
                // Small delay to avoid rate limiting
                if (chunks.length > 1) await new Promise(r => setTimeout(r, 300))
            }

            if (translatedParts.length > 0) {
                res.json({ translated: translatedParts.join(' ') })
            } else {
                res.status(500).json({ error: 'Translation returned no result' })
            }
        } catch (e: any) {
            console.error('[Translate] Error:', e.message)
            res.status(500).json({ error: e.message })
        }
    })

    // User Management Web Endpoints
    app.get('/api/users', (_req, res) => {
        if (!fs.existsSync(USERS_FILE)) return res.json([])
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
        res.json(users.map((u: any) => ({ username: u.username })))
    })

    app.post('/api/users', (req, res) => {
        const { username, password } = req.body
        try {
            // Logic similar to IPC create-user
            const fs_extra = require('fs-extra')
            if (!fs_extra.existsSync(USERS_FILE)) fs_extra.writeJsonSync(USERS_FILE, [])

            const users = fs_extra.readJsonSync(USERS_FILE)
            if (users.find((u: any) => u.username === username)) {
                return res.json({ success: false, error: 'El usuario ya existe' })
            }

            users.push({ username, password })
            fs_extra.writeJsonSync(USERS_FILE, users, { spaces: 2 })

            const USER_DB_PATH = path.join(process.cwd(), 'db_biblion', 'users', username)
            fs_extra.ensureDirSync(USER_DB_PATH)
            fs_extra.writeJsonSync(path.join(USER_DB_PATH, 'books.json'), [])
            const defaultConfig = {
                libraries: [{ id: 'default', name: 'Principal' }],
                activeLibraryId: 'default',
                tags: []
            }
            fs_extra.writeJsonSync(path.join(USER_DB_PATH, 'config.json'), defaultConfig)

            res.json({ success: true })
        } catch (e) {
            console.error(e)
            res.json({ success: false, error: 'Error interno al crear usuario' })
        }
    })

    app.post('/api/users/update', (req, res) => {
        const { username, password } = req.body
        try {
            const fs_extra = require('fs-extra')
            if (!fs_extra.existsSync(USERS_FILE)) return res.json({ success: false, error: 'No users file' })
            const users = fs_extra.readJsonSync(USERS_FILE)
            const index = users.findIndex((u: any) => u.username === username)

            if (index === -1) return res.json({ success: false, error: 'Usuario no encontrado' })

            users[index].password = password
            fs_extra.writeJsonSync(USERS_FILE, users, { spaces: 2 })
            res.json({ success: true })
        } catch (e) {
            res.json({ success: false, error: 'Error al actualizar' })
        }
    })

    app.post('/api/users/delete', (req, res) => {
        const { username } = req.body
        try {
            const fs_extra = require('fs-extra')
            if (!fs_extra.existsSync(USERS_FILE)) return res.json({ success: false, error: 'No users file' })
            const users = fs_extra.readJsonSync(USERS_FILE)
            const newUsers = users.filter((u: any) => u.username !== username)

            if (users.length === newUsers.length) return res.json({ success: false, error: 'Usuario no encontrado' })

            fs_extra.writeJsonSync(USERS_FILE, newUsers, { spaces: 2 })

            // Delete data folder
            const USER_DB_PATH = path.join(process.cwd(), 'db_biblion', 'users', username)
            if (fs_extra.existsSync(USER_DB_PATH)) {
                fs_extra.removeSync(USER_DB_PATH)
            }
            res.json({ success: true })
        } catch (e) {
            res.json({ success: false, error: 'Error al eliminar' })
        }
    })

    app.listen(PORT, '0.0.0.0', () => {
        const ipAddress = ip.address()
        console.log(`Server running at http://${ipAddress}:${PORT}`)
    })

    return {
        ip: ip.address(),
        port: PORT
    }
}
