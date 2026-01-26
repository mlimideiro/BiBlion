import express from 'express'
import cors from 'cors'
import path from 'path'
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
    app.get('/', (req, res) => {
        res.sendFile(path.join(staticPath, 'mobile.html'))
    })

    // Explicit fallback for /mobile.html if requested directly
    app.get('/mobile.html', (req, res) => {
        res.sendFile(path.join(staticPath, 'mobile.html'))
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

        // Fallback if coverUrl is missing
        const finalCover = bookData.coverUrl || ''

        const newBook: Book = {
            isbn: bookData.isbn,
            title: bookData.title,
            authors: bookData.authors,
            publisher: bookData.publisher,
            pageCount: bookData.pageCount,
            description: bookData.description,
            coverPath: finalCover,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }

        dataManager.saveBook(newBook)
        onBookUpdate(newBook)

        res.json({ success: true, book: newBook })
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
