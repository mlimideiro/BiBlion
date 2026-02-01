import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import ip from 'ip'
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
        console.log('Looking up ISBN:', isbn)
        const metadata = await metadataService.fetchByISBN(isbn)
        if (metadata) {
            res.json(metadata)
        } else {
            res.status(404).json({ error: 'Book not found' })
        }
    })

    app.post('/api/save', (req, res) => {
        const { username, ...bookData } = req.body
        console.log('Saving book:', bookData.title, 'for user:', username)

        // If it's a full book object from the library view, it might have libraryId and tags
        const newBook: Book = {
            ...bookData,
            createdAt: bookData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }

        dataManager.saveBook(username, newBook)
        onBookUpdate(username, newBook)

        // Return ALL books to match Electron behavior and update frontend state
        const allBooks = dataManager.getAllBooks(username)
        res.json(allBooks)
    })

    app.post('/api/bulk-save', (req, res) => {
        const { username, books } = req.body // Expecting { username, books: [] } or array? Frontend sends array usually? 
        // Logic check: Frontend usually sends just body. Need to check dataService.
        // Assuming dataService will be updated to wrap body in {username, ...} or I check if body is array.
        // If body is array, it's legacy/no-username? No, dataService needs update.
        // Let's assume body is { username, books: [...] }

        console.log('Bulk saving books:', books?.length)
        if (username && books) {
            dataManager.saveBooks(username, books)
            res.json(dataManager.getAllBooks(username))
        } else {
            // Fallback for legacy array
            // const books = req.body
            // ... legacy handling is tricky here if structure changes. 
            // Let's assume frontend is updated to send object.
            res.status(400).json({ error: "Invalid format" })
        }
    })

    app.post('/api/bulk-delete', (req, res) => {
        const { username, isbns } = req.body
        console.log('Bulk deleting books:', isbns?.length)
        if (username && isbns) {
            dataManager.deleteBooks(username, isbns)
            res.json(dataManager.getAllBooks(username))
        } else {
            res.status(400).json({ error: "Invalid format" })
        }
    })

    app.delete('/api/books/:isbn', (req, res) => {
        const { isbn } = req.params
        const { username } = req.body // Delete usually doesn't have body in some clients, but axios does. Query valid too.
        // Better use query for delete if body is unreliable? 
        // Let's try to get from query or body.
        const user = req.body.username || req.query.username

        console.log('Deleting book:', isbn, 'user:', user)
        const success = dataManager.deleteBook(user, isbn)

        if (success) {
            const allBooks = dataManager.getAllBooks(user)
            res.json(allBooks)
        } else {
            res.status(404).json({ error: 'Book not found' })
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
