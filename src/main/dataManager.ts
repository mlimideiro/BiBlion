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
    borrowerName?: string
    loanDate?: string
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
// Legacy paths
const LEGACY_DB_FILE = path.join(DB_PATH, 'books.json')
const LEGACY_CONFIG_FILE = path.join(DB_PATH, 'config.json')

const BACKUP_DIR = path.join(DB_PATH, 'backups')
const COVERS_DIR = path.join(DB_PATH, 'covers')

const LEGACY_USERS = ['marce', 'jush']

export class DataManager {
    constructor() {
        this.ensureStructure()
    }

    private normalizeIsbn(isbn: string): string {
        return isbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    }

    private ensureStructure() {
        fs.ensureDirSync(DB_PATH)
        fs.ensureDirSync(BACKUP_DIR)
        fs.ensureDirSync(COVERS_DIR)

        // Ensure legacy files exist just in case
        if (!fs.existsSync(LEGACY_DB_FILE)) {
            fs.writeJsonSync(LEGACY_DB_FILE, [])
        }
        if (!fs.existsSync(LEGACY_CONFIG_FILE)) {
            this.writeDefaultConfig(LEGACY_CONFIG_FILE)
        }
    }

    private writeDefaultConfig(configPath: string) {
        const defaultConfig: Config = {
            libraries: [{ id: 'default', name: 'Principal' }],
            activeLibraryId: 'default',
            tags: []
        }
        fs.writeJsonSync(configPath, defaultConfig)
    }

    // Helper to get paths based on user
    private getUserPaths(username: string) {
        // Legacy check
        if (!username || LEGACY_USERS.includes(username)) {
            return {
                books: LEGACY_DB_FILE,
                config: LEGACY_CONFIG_FILE
            }
        }

        // New user isolation
        const userDir = path.join(DB_PATH, 'users', username)
        fs.ensureDirSync(userDir)
        const booksFile = path.join(userDir, 'books.json')
        const configFile = path.join(userDir, 'config.json')

        // Init if not exists
        if (!fs.existsSync(booksFile)) fs.writeJsonSync(booksFile, [])
        if (!fs.existsSync(configFile)) this.writeDefaultConfig(configFile)

        return {
            books: booksFile,
            config: configFile
        }
    }

    public getConfig(username: string): Config {
        try {
            const { config: configFile } = this.getUserPaths(username)
            const config = fs.readJsonSync(configFile) as Config
            // Ensure tags array exists
            if (!config.tags) config.tags = []
            return config
        } catch (error) {
            console.error('Error reading Config:', error)
            return {
                libraries: [{ id: 'default', name: 'Principal' }],
                activeLibraryId: 'default',
                tags: []
            }
        }
    }

    public saveConfig(username: string, config: Config) {
        const { config: configFile } = this.getUserPaths(username)
        fs.writeJsonSync(configFile, config, { spaces: 2 })
    }

    public getAllBooks(username: string): Book[] {
        try {
            const { books: booksFile } = this.getUserPaths(username)
            return fs.readJsonSync(booksFile) as Book[]
        } catch (error) {
            console.error('Error reading DB:', error)
            return []
        }
    }

    public saveBook(username: string, book: Book) {
        const { books: booksFile } = this.getUserPaths(username)
        const books = this.getAllBooks(username)

        const normalizedIsbn = this.normalizeIsbn(book.isbn)
        const index = books.findIndex(b => this.normalizeIsbn(b.isbn) === normalizedIsbn)

        console.log(`[DataManager] Saving book for ${username}: "${book.title}"`)

        // Create Backup (Global backup logic for simplicity, could be per user but sticking to simple)
        this.createBackup(books, username)

        if (index >= 0) {
            // Update
            const existingBook = books[index]
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
            const newBook = { ...book }
            newBook.isbn = normalizedIsbn
            newBook.createdAt = new Date().toISOString()
            newBook.updatedAt = newBook.createdAt
            newBook.libraryId = "" // Default to unassigned
            books.push(newBook)
        }

        fs.writeJsonSync(booksFile, books, { spaces: 2 })
    }

    public deleteBook(username: string, isbn: string) {
        const { books: booksFile } = this.getUserPaths(username)
        const books = this.getAllBooks(username)
        const targetIsbn = this.normalizeIsbn(isbn)

        const filteredBooks = books.filter(b => {
            const normalized = this.normalizeIsbn(b.isbn)
            return normalized !== targetIsbn
        })

        if (filteredBooks.length !== books.length) {
            this.createBackup(books, username)
            fs.writeJsonSync(booksFile, filteredBooks, { spaces: 2 })
            return true
        }
        return false
    }

    public saveBooks(username: string, booksToSave: Book[]) {
        const { books: booksFile } = this.getUserPaths(username)
        const books = this.getAllBooks(username)
        this.createBackup(books, username)

        let changed = false
        booksToSave.forEach(book => {
            const normalizedIsbn = this.normalizeIsbn(book.isbn)
            const index = books.findIndex(b => this.normalizeIsbn(b.isbn) === normalizedIsbn)
            if (index >= 0) {
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
            fs.writeJsonSync(booksFile, books, { spaces: 2 })
        }
        return books
    }

    public deleteBooks(username: string, isbns: string[]) {
        const { books: booksFile } = this.getUserPaths(username)
        const books = this.getAllBooks(username)
        const targetIsbns = isbns.map(id => this.normalizeIsbn(id))
        const filteredBooks = books.filter(b => !targetIsbns.includes(this.normalizeIsbn(b.isbn)))

        if (filteredBooks.length !== books.length) {
            this.createBackup(books, username)
            fs.writeJsonSync(booksFile, filteredBooks, { spaces: 2 })
            return filteredBooks
        }
        return books
    }

    private createBackup(books: Book[], username: string) {
        try {
            const date = new Date().toISOString().split('T')[0]
            const backupFile = path.join(BACKUP_DIR, `books_${username}_${date}.json`)
            fs.writeJsonSync(backupFile, books, { spaces: 2 })

            // Clean up old backups for this user
            this.rotateBackups(username)
        } catch (error) {
            console.error('[DataManager] Backup error:', error)
        }
    }

    private rotateBackups(username: string) {
        try {
            const files = fs.readdirSync(BACKUP_DIR)
            const prefix = `books_${username}_`

            // Filter user backups and get stats
            const userBackups = files
                .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(BACKUP_DIR, f),
                    mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
                }))
                // Sort by modification time (descending)
                .sort((a, b) => b.mtime - a.mtime)

            // Keep only the last 10
            if (userBackups.length > 10) {
                const toDelete = userBackups.slice(10)
                toDelete.forEach(file => {
                    console.log(`[DataManager] Deleting old backup: ${file.name}`)
                    fs.unlinkSync(file.path)
                })
            }
        } catch (error) {
            console.error('[DataManager] Rotation error:', error)
        }
    }
}
