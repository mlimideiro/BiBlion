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
}

export interface Library {
    id: string
    name: string
}

export interface Config {
    libraries: Library[]
    activeLibraryId: string
}

const DB_PATH = 'db_biblioteka'
const DB_FILE = path.join(DB_PATH, 'books.json')
const CONFIG_FILE = path.join(DB_PATH, 'config.json')
const BACKUP_DIR = path.join(DB_PATH, 'backups')
const COVERS_DIR = path.join(DB_PATH, 'covers')

export class DataManager {
    constructor() {
        this.ensureDbStructure()
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
                activeLibraryId: 'default'
            }
            fs.writeJsonSync(CONFIG_FILE, defaultConfig)
        }
    }

    public getConfig(): Config {
        try {
            return fs.readJsonSync(CONFIG_FILE)
        } catch (e) {
            return { libraries: [{ id: 'default', name: 'Principal' }], activeLibraryId: 'default' }
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
        const config = this.getConfig()
        const index = books.findIndex(b => b.isbn === book.isbn)

        // Create Backup
        this.createBackup(books)

        if (index >= 0) {
            // Update
            books[index] = { ...books[index], ...book, updatedAt: new Date().toISOString() }
        } else {
            // New
            book.createdAt = new Date().toISOString()
            book.updatedAt = book.createdAt
            // Assign active library if not set
            if (!book.libraryId) {
                book.libraryId = config.activeLibraryId
            }
            books.push(book)
        }

        fs.writeJsonSync(DB_FILE, books, { spaces: 2 })
    }

    public deleteBook(isbn: string) {
        const books = this.getAllBooks()
        const filteredBooks = books.filter(b => b.isbn !== isbn)

        if (filteredBooks.length !== books.length) {
            this.createBackup(books)
            fs.writeJsonSync(DB_FILE, filteredBooks, { spaces: 2 })
            return true
        }
        return false
    }

    private createBackup(books: Book[]) {
        const date = new Date().toISOString().split('T')[0]
        const backupFile = path.join(BACKUP_DIR, `books.backup-${date}.json`)
        fs.writeJsonSync(backupFile, books, { spaces: 2 })
    }
}
