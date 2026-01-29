import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import ip from 'ip'
import { DataManager, Book } from './dataManager'
import { MetadataService } from './metadataService'

export function startServer(dataManager: DataManager, metadataService: MetadataService, onBookUpdate: (book: Book) => void) {
    const app = express()
    const PORT = 3000

    app.use(cors())
    app.use(express.json())

    const staticPath = path.join(__dirname, '../renderer')

    // CRITICAL FIX: Disable default index.html serving to avoid serving desktop app to mobile
    app.use(express.static(staticPath, { index: false }))

    // Explicitly serve mobile.html for root request
    app.get('/', (_req, res) => {
        res.sendFile(path.join(staticPath, 'mobile.html'))
    })

    // Explicit fallback for /mobile.html if requested directly
    app.get('/mobile.html', (_req, res) => {
        res.sendFile(path.join(staticPath, 'mobile.html'))
    })

    app.get('/api/books', (_req, res) => {
        const books = dataManager.getAllBooks()
        res.json(books)
    })

    app.get('/api/config', (_req, res) => {
        const config = dataManager.getConfig()
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
        const bookData = req.body
        console.log('Saving book:', bookData.title)

        // If it's a full book object from the library view, it might have libraryId and tags
        const newBook: Book = {
            ...bookData,
            createdAt: bookData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }

        dataManager.saveBook(newBook)
        onBookUpdate(newBook)

        // Return ALL books to match Electron behavior and update frontend state
        const allBooks = dataManager.getAllBooks()
        res.json(allBooks)
    })

    app.delete('/api/books/:isbn', (req, res) => {
        const { isbn } = req.params
        console.log('Deleting book:', isbn)
        const success = dataManager.deleteBook(isbn)

        if (success) {
            const allBooks = dataManager.getAllBooks()
            res.json(allBooks)
        } else {
            res.status(404).json({ error: 'Book not found' })
        }
    })

    app.post('/api/config', (req, res) => {
        const configData = req.body
        console.log('Updating config from mobile')
        dataManager.saveConfig(configData)
        res.json({ success: true })
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
