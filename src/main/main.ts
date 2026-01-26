import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { DataManager } from './dataManager'
import { startServer } from './server'
import { MetadataService } from './metadataService'

let mainWindow: BrowserWindow | null = null
const dataManager = new DataManager()
const metadataService = new MetadataService()

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
    const serverInfo = startServer(dataManager, metadataService, (newBook) => {
        // Notify desktop when a book is added/updated from mobile
        mainWindow?.webContents.send('books-updated', dataManager.getAllBooks())
    })

    // IPC Handlers
    ipcMain.handle('get-books', () => dataManager.getAllBooks())
    ipcMain.handle('save-book', (_event, book) => {
        dataManager.saveBook(book)
        return dataManager.getAllBooks()
    })
    ipcMain.handle('delete-book', (_event, isbn) => {
        dataManager.deleteBook(isbn)
        return dataManager.getAllBooks()
    })
    ipcMain.handle('get-server-info', () => serverInfo)

    // Library & Config Handlers
    ipcMain.handle('get-config', () => dataManager.getConfig())
    ipcMain.handle('save-config', (_event, config) => {
        dataManager.saveConfig(config)
        // Notify mobile server if needed or refresh desktop data
        mainWindow?.webContents.send('config-updated', config)
        return config
    })

    // Metadata Repair Handler
    ipcMain.handle('repair-metadata', async (_event, isbn) => {
        const result = await metadataService.fetchByISBN(isbn)
        return result
    })

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
