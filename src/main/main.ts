import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import fsExtra from 'fs-extra'
import axios from 'axios'
import { DataManager } from './dataManager'
import { startServer } from './server'
import { MetadataService } from './metadataService'
import { ScraperService } from './scraperService'

let mainWindow: BrowserWindow | null = null
const dataManager = new DataManager()
const metadataService = new MetadataService()
const scraperService = new ScraperService()
metadataService.setScraperService(scraperService)

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../../src/renderer/src/assets/logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    })

    // In development mode, load from vite dev server
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173')
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
}

app.whenReady().then(() => {
    createWindow()

    // Start Server
    const serverInfo = startServer(dataManager, metadataService, scraperService, (username, _book) => {
        // Notify desktop when a book is added/updated from mobile
        mainWindow?.webContents.send('books-updated', { username, books: dataManager.getAllBooks(username) })
    })

    // IPC Handlers
    // IPC Handlers
    // Helper: download external cover to per-user local storage (fire & forget)
    const downloadCoverToLocal = (username: string, isbn: string, coverUrl: string) => {
        if (!coverUrl || !coverUrl.startsWith('http')) return
        const cleanIsbn = isbn.replace(/[^a-zA-Z0-9]/g, '')
        const coversDir = path.join(process.cwd(), 'db_biblion', 'users', username, 'covers')
        const localFilename = `${cleanIsbn}.jpg`
        const localPath = path.join(coversDir, localFilename)
        
        if (fs.existsSync(localPath)) {
            // Update the book path if it was left as HTTP even when cached
            const books = dataManager.getAllBooks(username)
            const idx = books.findIndex(b => b.isbn.replace(/[^a-zA-Z0-9]/g, '') === cleanIsbn)
            if (idx >= 0 && books[idx].coverPath !== `local:${username}:${localFilename}`) {
                books[idx].coverUrl = books[idx].coverUrl || books[idx].coverPath
                books[idx].coverPath = `local:${username}:${localFilename}`
                const userDir = path.join(process.cwd(), 'db_biblion', 'users', username)
                const booksFile = path.join(userDir, 'books.json')
                fsExtra.writeJsonSync(booksFile, books, { spaces: 2 })
                mainWindow?.webContents.send('books-updated', { username, books: dataManager.getAllBooks(username) })
            }
            return
        }

        axios.get(coverUrl, { 
            responseType: 'arraybuffer', 
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        })
            .then(response => {
                fsExtra.ensureDirSync(coversDir)
                fs.writeFileSync(localPath, Buffer.from(response.data))
                const books = dataManager.getAllBooks(username)
                const idx = books.findIndex(b => b.isbn.replace(/[^a-zA-Z0-9]/g, '') === cleanIsbn)
                if (idx >= 0) {
                    books[idx].coverUrl = coverUrl  // Preserve original for backup/restore
                    books[idx].coverPath = `local:${username}:${localFilename}`
                    const userDir = path.join(process.cwd(), 'db_biblion', 'users', username)
                    const booksFile = path.join(userDir, 'books.json')
                    fsExtra.writeJsonSync(booksFile, books, { spaces: 2 })
                    console.log(`[Cover IPC] Cached locally for ${username}/${cleanIsbn}`)
                    mainWindow?.webContents.send('books-updated', { username, books: dataManager.getAllBooks(username) })
                }
            })
            .catch(e => console.warn(`[Cover IPC] Download failed for ${isbn}:`, e.message))
    }

    ipcMain.handle('get-books', (_event, username) => dataManager.getAllBooks(username))
    ipcMain.handle('save-book', (_event, { username, book }) => {
        dataManager.saveBook(username, book)
        // Background cover download
        if (book.coverPath?.startsWith('http')) {
            downloadCoverToLocal(username, book.isbn, book.coverPath)
        }
        return dataManager.getAllBooks(username)
    })
    ipcMain.handle('delete-book', (_event, { username, isbn }) => {
        dataManager.deleteBook(username, isbn)
        return dataManager.getAllBooks(username)
    })
    ipcMain.handle('bulk-save-books', (_event, { username, books }) => {
        dataManager.saveBooks(username, books)
        return dataManager.getAllBooks(username)
    })
    ipcMain.handle('bulk-delete-books', (_event, { username, isbns }) => {
        dataManager.deleteBooks(username, isbns)
        return dataManager.getAllBooks(username)
    })
    ipcMain.handle('import-books', (_event, { username, books, mode }) => {
        const result = dataManager.importBooks(username, books, mode)

        // Background: re-download covers for imported books that have coverUrl
        const allBooks = dataManager.getAllBooks(username)
        let delay = 0
        for (const book of allBooks) {
            const url = book.coverUrl || (book.coverPath?.startsWith('http') ? book.coverPath : null)
            if (url) {
                setTimeout(() => downloadCoverToLocal(username, book.isbn, url), delay)
                delay += 500
            }
        }
        if (delay > 0) console.log(`[Import IPC] Queued cover downloads for ${Math.floor(delay / 500)} books`)

        return result
    })
    ipcMain.handle('get-server-info', () => serverInfo)

    // Library & Config Handlers
    ipcMain.handle('get-config', (_event, username) => dataManager.getConfig(username))
    ipcMain.handle('save-config', (_event, { username, config }) => {
        dataManager.saveConfig(username, config)
        // Notify mobile server if needed or refresh desktop data
        mainWindow?.webContents.send('config-updated', config)
        return config
    })

    // Metadata Repair Handler
    ipcMain.handle('repair-metadata', async (_event, isbn) => {
        const result = await metadataService.lookup(isbn)
        return result
    })

    ipcMain.handle('scrape-metadata', async (_event, url) => {
        const result = await scraperService.scrape(url)
        return result
    })

    ipcMain.handle('login', async (_event, { username, password }) => {
        console.log('[Login Attempt]', { username, password: '***' }) // Don't log actual password in prod, but for local debug it might be necessary if we suspect mismatch.
        // Actually, let's log length to separate from value
        console.log(`[Login Debug] User: '${username}' (${username.length}), Pass: '${password}' (${password.length})`)

        try {
            // 1. Check for Superadmin
            if (username === 'superadmin_mlimideiro' && password === '!MeGustaElCafe!@2011') {
                return { success: true, username: 'SuperAdmin', isAdmin: true }
            }

            const USERS_FILE = path.join(process.cwd(), 'db_biblion', 'users.json')
            if (!fs.existsSync(USERS_FILE)) {
                return { success: false, error: 'Configuración no encontrada' }
            }
            const fs_extra = require('fs-extra')
            const users = fs_extra.readJsonSync(USERS_FILE)
            const user = users.find((u: any) => u.username === username && u.password === password)
            if (user) {
                return { success: true, username: user.username, isAdmin: false }
            }
            return { success: false, error: 'Usuario o contraseña incorrectos' }
        } catch (e) {
            return { success: false, error: 'Error de servidor' }
        }
    })

    // User Management Handlers
    ipcMain.handle('get-users', async () => {
        const USERS_FILE = path.join(process.cwd(), 'db_biblion', 'users.json')
        if (fs.existsSync(USERS_FILE)) {
            const fs_extra = require('fs-extra')
            return fs_extra.readJsonSync(USERS_FILE).map((u: any) => ({ username: u.username }))
        }
        return []
    })

    ipcMain.handle('create-user', async (_event, { username, password }) => {
        try {
            const USERS_FILE = path.join(process.cwd(), 'db_biblion', 'users.json')
            const fs_extra = require('fs-extra')

            // Ensure users file
            if (!fs.existsSync(USERS_FILE)) {
                fs_extra.writeJsonSync(USERS_FILE, [])
            }

            const users = fs_extra.readJsonSync(USERS_FILE)
            if (users.find((u: any) => u.username === username)) {
                return { success: false, error: 'El usuario ya existe' }
            }

            // Add user
            users.push({ username, password })
            fs_extra.writeJsonSync(USERS_FILE, users, { spaces: 2 })

            // Create User Directory Structure
            const USER_DB_PATH = path.join(process.cwd(), 'db_biblion', 'users', username)
            fs_extra.ensureDirSync(USER_DB_PATH)

            // Create empty books file
            fs_extra.writeJsonSync(path.join(USER_DB_PATH, 'books.json'), [])

            // Create default config
            const defaultConfig = {
                libraries: [{ id: 'default', name: 'Principal' }],
                activeLibraryId: 'default',
                tags: []
            }
            fs_extra.writeJsonSync(path.join(USER_DB_PATH, 'config.json'), defaultConfig)

            return { success: true }
        } catch (error) {
            console.error(error)
            return { success: false, error: 'Error al crear usuario' }
        }
    })

    ipcMain.handle('update-user', async (_event, { username, password }) => {
        try {
            const USERS_FILE = path.join(process.cwd(), 'db_biblion', 'users.json')
            const fs_extra = require('fs-extra')
            const users = fs_extra.readJsonSync(USERS_FILE)
            const index = users.findIndex((u: any) => u.username === username)
            if (index !== -1) {
                users[index].password = password
                fs_extra.writeJsonSync(USERS_FILE, users, { spaces: 2 })
                return { success: true }
            }
            return { success: false, error: 'Usuario no encontrado' }
        } catch (e) {
            return { success: false, error: 'Error al actualizar' }
        }
    })

    ipcMain.handle('delete-user', async (_event, { username }) => {
        try {
            const USERS_FILE = path.join(process.cwd(), 'db_biblion', 'users.json')
            const fs_extra = require('fs-extra')
            const users = fs_extra.readJsonSync(USERS_FILE)
            const newUsers = users.filter((u: any) => u.username !== username)

            if (users.length !== newUsers.length) {
                fs_extra.writeJsonSync(USERS_FILE, newUsers, { spaces: 2 })
                const USER_DB_PATH = path.join(process.cwd(), 'db_biblion', 'users', username)
                fs_extra.removeSync(USER_DB_PATH)
                return { success: true }
            }
            return { success: false, error: 'Usuario no encontrado' }
        } catch (e) {
            return { success: false, error: 'Error al eliminar' }
        }
    })

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
