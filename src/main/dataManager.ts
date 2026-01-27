import fs from 'fs-extra'
import path from 'path'

// Structure of a Book
export interface Book {
    isbn: string
    title: string
    authors: string[]
    publisher?: string
    pageCount?: number
    description?: string
    coverPath?: string
    createdAt: string
    updatedAt: string
    libraryId?: string // Which library it belongs to
    // User fields
    location?: string
    status?: 'reading' | 'read' | 'borrowed' | 'available'
    notes?: string
    tags?: string[]
}

export interface Library {
    id: string
    name: string
}

export interface Config {
    libraries: Library[]
    activeLibraryId: string
    tags: string[]
}

const DB_PATH = 'db_biblion'
const DB_FILE = path.join(DB_PATH, 'books.json')
const CONFIG_FILE = path.join(DB_PATH, 'config.json')
const BACKUP_DIR = path.join(DB_PATH, 'backups')
const COVERS_DIR = path.join(DB_PATH, 'covers')

export class DataManager {
    constructor() {
        this.ensureDbStructure()
    }

    private normalizeIsbn(isbn: string): string {
        return isbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    }

    private ensureDbStructure() {
        fs.ensureDirSync(DB_PATH)
        fs.ensureDirSync(BACKUP_DIR)
        fs.ensureDirSync(COVERS_DIR)

        if (!fs.existsSync(DB_FILE)) {
            fs.writeJsonSync(DB_FILE, [])
        }

        if (!fs.existsSync(CONFIG_FILE)) {
            const defaultConfig: Config = {
                libraries: [{ id: 'default', name: 'Principal' }],
                activeLibraryId: 'default',
                tags: []
            }
            fs.writeJsonSync(CONFIG_FILE, defaultConfig)
        }
    }

    public getConfig(): Config {
        try {
            const config = fs.readJsonSync(CONFIG_FILE)
            if (!config.tags) config.tags = []
            return config
        } catch (e) {
            return { libraries: [{ id: 'default', name: 'Principal' }], activeLibraryId: 'default', tags: [] }
        }
    }

    public saveConfig(config: Config) {
        fs.writeJsonSync(CONFIG_FILE, config, { spaces: 2 })
    }

    public getAllBooks(): Book[] {
        try {
            return fs.readJsonSync(DB_FILE) as Book[]
        } catch (error) {
            console.error('Error reading DB:', error)
            return []
        }
    }

    public saveBook(book: Book) {
        const books = this.getAllBooks()
        const normalizedIsbn = this.normalizeIsbn(book.isbn)
        const index = books.findIndex(b => this.normalizeIsbn(b.isbn) === normalizedIsbn)

        console.log(`[DataManager] Saving book: "${book.title}" (ISBN: ${book.isbn}, Normalized: ${normalizedIsbn})`)
        console.log(`[DataManager] Existing index: ${index}`)

        // Create Backup
        this.createBackup(books)

        if (index >= 0) {
            // Update
            const existingBook = books[index]
            console.log(`[DataManager] Updating existing book in library: ${existingBook.libraryId}`)
            books[index] = {
                ...existingBook,
                ...book,
                libraryId: book.libraryId !== undefined ? book.libraryId : existingBook.libraryId,
                tags: book.tags !== undefined ? book.tags : existingBook.tags,
                createdAt: existingBook.createdAt,
                isbn: existingBook.isbn,
                updatedAt: new Date().toISOString()
            }
        } else {
            // New
            console.log(`[DataManager] Creating new book as UNASSIGNED`)
            const newBook = { ...book }
            newBook.isbn = normalizedIsbn // Store normalized
            newBook.createdAt = new Date().toISOString()
            newBook.updatedAt = newBook.createdAt

            // CRITICAL: New books always go to "unassigned" regardless of active library
            newBook.libraryId = ""

            books.push(newBook)
        }

        fs.writeJsonSync(DB_FILE, books, { spaces: 2 })
    }

    public deleteBook(isbn: string) {
        const books = this.getAllBooks()
        const targetIsbn = this.normalizeIsbn(isbn)
        console.log(`[DataManager] Deleting book: ${isbn} (Normalized: ${targetIsbn})`)

        const filteredBooks = books.filter(b => {
            const normalized = this.normalizeIsbn(b.isbn)
            return normalized !== targetIsbn
        })

        if (filteredBooks.length !== books.length) {
            console.log(`[DataManager] Deleted successfully. New count: ${filteredBooks.length}`)
            this.createBackup(books)
            fs.writeJsonSync(DB_FILE, filteredBooks, { spaces: 2 })
            return true
        }
        console.warn(`[DataManager] Delete FAILED: ISBN not found among ${books.length} books.`)
        return false
    }

    public saveBooks(booksToSave: Book[]) {
        const books = this.getAllBooks()
        // Create Backup
        this.createBackup(books)

        let changed = false
        booksToSave.forEach(book => {
            const normalizedIsbn = this.normalizeIsbn(book.isbn)
            const index = books.findIndex(b => this.normalizeIsbn(b.isbn) === normalizedIsbn)
            if (index >= 0) {
                // Update: preserve library and tags if not explicitly provided in the update
                const existing = books[index]
                books[index] = {
                    ...existing,
                    ...book,
                    libraryId: book.libraryId !== undefined ? book.libraryId : existing.libraryId,
                    tags: book.tags !== undefined ? book.tags : existing.tags,
                    updatedAt: new Date().toISOString()
                }
                changed = true
            } else {
                const newBook = { ...book, isbn: normalizedIsbn, libraryId: "" }
                newBook.createdAt = new Date().toISOString()
                newBook.updatedAt = newBook.createdAt
                books.push(newBook)
                changed = true
            }
        })

        if (changed) {
            fs.writeJsonSync(DB_FILE, books, { spaces: 2 })
        }
        return books
    }

    public deleteBooks(isbns: string[]) {
        const books = this.getAllBooks()
        const targetIsbns = isbns.map(id => this.normalizeIsbn(id))
        const filteredBooks = books.filter(b => !targetIsbns.includes(this.normalizeIsbn(b.isbn)))

        if (filteredBooks.length !== books.length) {
            this.createBackup(books)
            fs.writeJsonSync(DB_FILE, filteredBooks, { spaces: 2 })
            return filteredBooks
        }
        return books
    }

    private createBackup(books: Book[]) {
        const date = new Date().toISOString().split('T')[0]
        const backupFile = path.join(BACKUP_DIR, `books.backup-${date}.json`)
        fs.writeJsonSync(backupFile, books, { spaces: 2 })
    }
}
