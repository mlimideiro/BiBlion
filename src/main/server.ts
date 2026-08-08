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
import { AdminUtils } from './adminUtils'
import AdmZip from 'adm-zip'

export function startServer(
    dataManager: DataManager,
    metadataService: MetadataService,
    scraperService: ScraperService,
    onBookUpdate: (username: string, book: Book) => void
) {
    const app = express()
    const PORT = 3000

    app.use(express.json({ limit: '50mb' }))
    app.use(express.urlencoded({ limit: '50mb', extended: true }))
    app.use(cors())

    const USERS_FILE = path.join(process.cwd(), 'db_biblion', 'users.json')
    const adminUtils = new AdminUtils(dataManager)

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

    app.get('/api/covers/shared/:filename', (req, res) => {
        const { filename } = req.params
        const sharedPath = path.join(process.cwd(), 'db_biblion', 'covers', 'shared', filename)
        if (fs.existsSync(sharedPath)) {
            res.sendFile(sharedPath)
        } else {
            res.status(404).json({ error: 'Shared cover not found' })
        }
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

    app.post('/api/covers/rename', (req, res) => {
        const { username, oldIsbn, newIsbn } = req.body
        if (!username || !oldIsbn || !newIsbn) {
            return res.status(400).json({ error: 'Missing parameters' })
        }
        try {
            const cleanOld = oldIsbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
            const cleanNew = newIsbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
            const oldPath = path.join(process.cwd(), 'db_biblion', 'users', username, 'covers', `${cleanOld}.jpg`)
            const newPath = path.join(process.cwd(), 'db_biblion', 'users', username, 'covers', `${cleanNew}.jpg`)
            
            if (fs.existsSync(oldPath)) {
                fsExtra.ensureDirSync(path.dirname(newPath))
                fs.renameSync(oldPath, newPath)
                res.json({ success: true, renamed: true })
            } else {
                res.json({ success: true, renamed: false })
            }
        } catch (error) {
            console.error(`[Server] Error renaming cover for ${username}:`, error)
            res.status(500).json({ error: (error as Error).message })
        }
    })

    app.post('/api/covers/upload', (req, res) => {
        const { username, isbn, imageData } = req.body
        if (!username || !isbn || !imageData) {
            return res.status(400).json({ error: 'Missing parameters (username, isbn, imageData)' })
        }

        try {
            const cleanIsbn = isbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
            const coversDir = path.join(process.cwd(), 'db_biblion', 'users', username, 'covers')
            const localFilename = `${cleanIsbn}.jpg`
            const localPath = path.join(coversDir, localFilename)

            // Decode base64
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "")
            const buffer = Buffer.from(base64Data, 'base64')

            fsExtra.ensureDirSync(coversDir)
            fs.writeFileSync(localPath, buffer)

            console.log(`[Server] Manual cover upload for ${username}/${cleanIsbn} saved.`)
            res.json({ success: true, coverPath: `local:${username}:${localFilename}` })
        } catch (error) {
            console.error(`[Server] Error uploading cover for ${username}:`, error)
            res.status(500).json({ error: (error as Error).message })
        }
    })

    app.post('/api/admin/optimize-global-images', async (_req, res) => {
        console.log('[Admin] Request for optimize-global-images...')
        res.setHeader('Content-Type', 'text/plain')
        await adminUtils.optimizeGlobalImages((msg) => {
            res.write(msg + '\n')
        })
        res.end()
    })

    app.get('/api/admin/shared-covers', (_req, res) => {
        try {
            const SHARED_DIR = path.join(process.cwd(), 'db_biblion', 'covers', 'shared')
            fsExtra.ensureDirSync(SHARED_DIR)
            const files = fs.readdirSync(SHARED_DIR)
                .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
                .map(f => {
                    const stats = fs.statSync(path.join(SHARED_DIR, f))
                    return {
                        filename: f,
                        size: stats.size,
                        updatedAt: stats.mtime
                    }
                })
            res.json(files)
        } catch (error) {
            res.status(500).json({ error: (error as Error).message })
        }
    })

    app.post('/api/admin/shared-covers/update', async (req, res) => {
        const { filename, url, imageData } = req.body
        const SHARED_DIR = path.join(process.cwd(), 'db_biblion', 'covers', 'shared')
        const targetPath = path.join(SHARED_DIR, filename)

        try {
            if (imageData) {
                const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "")
                const buffer = Buffer.from(base64Data, 'base64')
                fs.writeFileSync(targetPath, buffer)
                return res.json({ success: true })
            } else if (url) {
                const response = await axios.get(url, { responseType: 'arraybuffer' })
                fs.writeFileSync(targetPath, Buffer.from(response.data))
                return res.json({ success: true })
            }
            res.status(400).json({ error: 'No data or URL provided' })
        } catch (error) {
            res.status(500).json({ error: (error as Error).message })
        }
    })

    app.post('/api/admin/sync-covers', async (_req, res) => {
        console.log('[Admin] Request for sync-covers...')
        res.setHeader('Content-Type', 'text/plain')
        res.setHeader('Transfer-Encoding', 'chunked')

        try {
            await adminUtils.syncAllUserCovers((msg) => {
                res.write(msg + '\n')
            })
            try {
                const users = fs.readdirSync(path.join(process.cwd(), 'db_biblion', 'users')).filter(f => fs.statSync(path.join(process.cwd(), 'db_biblion', 'users', f)).isDirectory())
                users.forEach(u => onBookUpdate(u, {} as Book))
            } catch (e) {
                console.error('Error broadcasting update after sync:', e)
            }
            res.end()
        } catch (error: any) {
            console.error('[Admin] Global error during sync:', error)
            res.write('\n[FATAL ERROR] ' + error.message)
            res.end()
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
    const downloadCoverToLocal = async (username: string, isbn: string, coverUrl: string) => {
        if (!coverUrl || !coverUrl.startsWith('http')) return
        const cleanIsbn = isbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
        const localFilename = `${cleanIsbn}.jpg`
        const coversDir = path.join(process.cwd(), 'db_biblion', 'users', username, 'covers')
        const localPath = path.join(coversDir, localFilename)

        // 1. Check if the book already points to local
        const books = dataManager.getAllBooks(username)
        const idx = books.findIndex(b => b.isbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanIsbn)
        
        if (idx >= 0) {
            const book = books[idx]
            if (book.coverPath === `local:${username}:${localFilename}` && fs.existsSync(localPath)) {
                return // Everything ok, skip
            }
        }

        // 2. If file exists but record doesn't, update record and skip download
        if (fs.existsSync(localPath)) {
            if (idx >= 0) {
                books[idx].coverUrl = books[idx].coverUrl || books[idx].coverPath
                books[idx].coverPath = `local:${username}:${localFilename}`
                dataManager.saveBooks(username, [books[idx]])
                console.log(`[Cover] Sync: Record updated for existing file ${cleanIsbn}`)
                onBookUpdate(username, books[idx])
            }
            return
        }

        // 3. Download from external URL
        try {
            let coverReferer = 'https://www.google.com/'
            try { coverReferer = new URL(coverUrl).origin + '/' } catch { /* keep default */ }

            const response = await axios.get(coverUrl, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': coverReferer,
                    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8'
                }
            })

            fsExtra.ensureDirSync(coversDir)
            fs.writeFileSync(localPath, Buffer.from(response.data))

            // Update database
            const currentBooks = dataManager.getAllBooks(username)
            const currentIdx = currentBooks.findIndex(b => b.isbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanIsbn)
            if (currentIdx >= 0) {
                currentBooks[currentIdx].coverUrl = coverUrl
                currentBooks[currentIdx].coverPath = `local:${username}:${localFilename}`
                dataManager.saveBooks(username, [currentBooks[currentIdx]])
                console.log(`[Cover] Downloaded and cached: ${username}/${cleanIsbn}`)
                onBookUpdate(username, currentBooks[currentIdx])
            }
        } catch (e) {
            console.warn(`[Cover] Download failed for ${isbn} (${coverUrl}): ${(e as Error).message}`)
        }
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
                let queuedCount = 0
                let delay = 0
                for (const book of allBooks) {
                    const url = book.coverUrl || (book.coverPath?.startsWith('http') ? book.coverPath : null)
                    if (url) {
                        queuedCount++
                        setTimeout(() => downloadCoverToLocal(username, book.isbn, url), delay)
                        delay += 300 // Slightly faster but still staggered
                    }
                }
                if (queuedCount > 0) {
                    console.log(`[Import] Queued cover downloads for ${queuedCount} books. Total estimation: ${Math.round(delay/1000)}s`)
                }
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
            const allBooks = dataManager.getAllBooks(username as string)
            res.json(allBooks)
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

    // --- BACKUP SYSTEM ---

    app.get('/api/backup/export', (req, res) => {
        const { username } = req.query
        if (!username) return res.status(400).json({ error: 'Username is required' })

        console.log(`[Backup] Exporting data for ${username}...`)
        try {
            const userDir = path.join(process.cwd(), 'db_biblion', 'users', username as string)
            const coversDir = path.join(userDir, 'covers')
            const booksFile = path.join(userDir, 'books.json')
            const configFile = path.join(userDir, 'config.json')

            const zip = new AdmZip()

            // 1. Add JSON files
            if (fs.existsSync(booksFile)) {
                zip.addLocalFile(booksFile)
            }
            if (fs.existsSync(configFile)) {
                zip.addLocalFile(configFile)
            }

            // 2. Add covers (ONLY manual ones)
            if (fs.existsSync(coversDir) && fs.existsSync(booksFile)) {
                const books = JSON.parse(fs.readFileSync(booksFile, 'utf8'))
                const manualFilenames = new Set<string>()

                books.forEach((book: any) => {
                    if (book.coverType === 'manual' && book.coverPath?.startsWith('local:')) {
                        const parts = book.coverPath.split(':')
                        if (parts.length === 3) {
                            manualFilenames.add(parts[2])
                        }
                    }
                })

                // Also include anything starting with MANUAL in the filename (for safety/manual books)
                const allFiles = fs.readdirSync(coversDir)
                allFiles.forEach(f => {
                    if (f.toUpperCase().startsWith('MANUAL')) {
                        manualFilenames.add(f)
                    }
                })

                if (manualFilenames.size > 0) {
                    manualFilenames.forEach(filename => {
                        const filePath = path.join(coversDir, filename)
                        if (fs.existsSync(filePath)) {
                            zip.addLocalFile(filePath, 'covers')
                        }
                    })
                }
            }

            const buffer = zip.toBuffer()
            const date = new Date().toISOString().split('T')[0]
            const filename = `biblion_backup_${username}_${date}.zip`

            res.set('Content-Type', 'application/zip')
            res.set('Content-Disposition', `attachment; filename=${filename}`)
            res.send(buffer)
            console.log(`[Backup] Export successful: ${filename} (${Math.round(buffer.length / 1024)} KB)`)
        } catch (error) {
            console.error('[Backup] Export error:', error)
            res.status(500).json({ error: (error as Error).message })
        }
    })

    app.post('/api/backup/import', (req, res) => {
        const { username, zipData, mode } = req.body
        if (!username || !zipData) return res.status(400).json({ error: 'Username and zipData are required' })

        console.log(`[Backup] Importing data for ${username} (Mode: ${mode})...`)
        try {
            const buffer = Buffer.from(zipData, 'base64')
            const zip = new AdmZip(buffer)
            const zipEntries = zip.getEntries()

            const userDir = path.join(process.cwd(), 'db_biblion', 'users', username)
            const coversDir = path.join(userDir, 'covers')
            fsExtra.ensureDirSync(coversDir)

            let booksJson: any[] | null = null
            let configJson: any = null

            // 1. Extract and find JSON data first
            zipEntries.forEach((entry) => {
                if (entry.entryName === 'books.json') {
                    booksJson = JSON.parse(entry.getData().toString('utf8'))
                } else if (entry.entryName === 'config.json') {
                    configJson = JSON.parse(entry.getData().toString('utf8'))
                }
            })

            if (!booksJson) {
                return res.status(400).json({ error: 'Invalid backup: books.json not found in ZIP' })
            }

            // 2. Restore covers
            zipEntries.forEach((entry) => {
                if (entry.entryName.startsWith('covers/') && !entry.isDirectory) {
                    const filename = entry.entryName.split('/').pop()
                    if (filename) {
                        const targetPath = path.join(coversDir, filename)
                        fs.writeFileSync(targetPath, entry.getData())
                    }
                }
            })

            // 3. Update Database
            if (mode === 'replace') {
                dataManager.importBooks(username, booksJson, 'replace')
                if (configJson) dataManager.saveConfig(username, configJson)
            } else {
                // Merge mode
                dataManager.importBooks(username, booksJson, 'merge')
                // For config, we usually don't want to overwrite libraries/tags in merge mode 
                // unless they are completely missing.
            }

            console.log(`[Backup] Import successful for ${username}`)
            res.json({ success: true, books: dataManager.getAllBooks(username) })
        } catch (error) {
            console.error('[Backup] Import error:', error)
            res.status(500).json({ error: (error as Error).message })
        }
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
