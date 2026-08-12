import fs from 'fs-extra'
import path from 'path'

// Structure of a Book
export interface Book {
    isbn: string
    barcode?: string  // Código de barras (EAN-13), puede diferir del ISBN
    title: string
    authors: string[]
    publisher?: string
    pageCount?: number
    description?: string
    coverPath?: string
    coverUrl?: string  // Original HTTP URL preserved for backup/restore
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
    coverType?: 'manual' | 'auto'
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
        fs.ensureDirSync(path.join(DB_PATH, 'cache', 'metadata'))

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
        const { config: configFile } = this.getUserPaths(username)
        try {
            const config = fs.readJsonSync(configFile) as Config
            // Ensure tags array exists
            if (!config.tags) config.tags = []
            return config
        } catch (error) {
            console.error(`[DataManager] Error reading Config for ${username}:`, error)
            // If file exists but is corrupted, we might want to know. 
            // But for config, default is usually safe.
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
        const { books: booksFile } = this.getUserPaths(username)
        try {
            if (!fs.existsSync(booksFile)) {
                return []
            }
            const books = fs.readJsonSync(booksFile) as Book[]
            return books.map(b => this.normalizeBook(b))
        } catch (error) {
            console.error(`[DataManager] CRITICAL: Error reading books.json for ${username}:`, error)
            // NEVER return [] on read error if the file exists, 
            // as it would lead callers to overwrite the DB with partial data.
            throw new Error(`Could not read database for user ${username}. Data integrity preserved.`)
        }
    }

    private normalizeBook(book: any): Book {
        return {
            ...book,
            isbn: book.isbn || `MISSING-${Date.now()}`,
            title: book.title || 'Sin Título',
            authors: Array.isArray(book.authors) ? book.authors : (book.author ? [book.author] : []),
            tags: Array.isArray(book.tags) ? book.tags : [],
            coverType: book.coverType || (book.coverPath?.startsWith('local:') ? 'auto' : undefined),
            createdAt: book.createdAt || new Date().toISOString(),
            updatedAt: book.updatedAt || new Date().toISOString()
        }
    }

    private formatTitleCase(title: string | undefined): string {
        if (!title) return ''
        const lowerExceptions = ['y', 'e', 'ni', 'o', 'u', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'a', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'desde', 'en', 'entre', 'hacia', 'hasta', 'para', 'por', 'según', 'sin', 'so', 'sobre', 'tras', 'del', 'al']
        
        return title.split(' ').map((word, index) => {
            if (word.length === 0) return word
            const lowerWord = word.toLowerCase()
            if (index > 0 && lowerExceptions.includes(lowerWord)) {
                return lowerWord
            }
            return word.charAt(0).toUpperCase() + lowerWord.slice(1)
        }).join(' ')
    }

    public saveBook(username: string, book: Book) {
        const { books: booksFile } = this.getUserPaths(username)
        const books = this.getAllBooks(username)
        const normalizedInput = this.normalizeBook(book)

        const normalizedIsbn = this.normalizeIsbn(normalizedInput.isbn)
        const index = books.findIndex(b => this.normalizeIsbn(b.isbn) === normalizedIsbn)

        console.log(`[DataManager] Saving book for ${username}: "${book.title}"`)

        // Create Backup (Global backup logic for simplicity, could be per user but sticking to simple)
        this.createBackup(books, username)

        if (index >= 0) {
            // Update
            const existingBook = books[index]
            books[index] = {
                ...existingBook,
                ...normalizedInput,
                title: this.formatTitleCase(normalizedInput.title),
                libraryId: normalizedInput.libraryId !== undefined ? normalizedInput.libraryId : existingBook.libraryId,
                tags: normalizedInput.tags !== undefined ? normalizedInput.tags : existingBook.tags,
                createdAt: existingBook.createdAt,
                isbn: existingBook.isbn,
                updatedAt: new Date().toISOString()
            }
        } else {
            // New
            const newBook = { ...normalizedInput, title: this.formatTitleCase(normalizedInput.title) }
            newBook.isbn = normalizedIsbn
            newBook.createdAt = new Date().toISOString()
            newBook.updatedAt = newBook.createdAt
            // Preserve libraryId if provided (important for wishlist conversion)
            newBook.libraryId = normalizedInput.libraryId !== undefined ? normalizedInput.libraryId : ""
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

        console.log(`[DataManager] Bulk saving ${booksToSave.length} books for ${username}`)
        this.createBackup(books, username)

        let changed = false
        booksToSave.forEach(bookInput => {
            const book = this.normalizeBook(bookInput)
            const normalizedIsbn = this.normalizeIsbn(book.isbn)
            const index = books.findIndex(b => this.normalizeIsbn(b.isbn) === normalizedIsbn)
            if (index >= 0) {
                const existing = books[index]
                books[index] = {
                    ...existing,
                    ...book,
                    title: this.formatTitleCase(book.title),
                    libraryId: book.libraryId !== undefined ? book.libraryId : existing.libraryId,
                    tags: book.tags !== undefined ? book.tags : existing.tags,
                    createdAt: existing.createdAt, // Preserve
                    updatedAt: new Date().toISOString()
                }
                changed = true
            } else {
                const newBook = { ...book, title: this.formatTitleCase(book.title) }
                newBook.isbn = normalizedIsbn
                newBook.createdAt = new Date().toISOString()
                newBook.updatedAt = newBook.createdAt
                // Preserve libraryId if provided
                newBook.libraryId = book.libraryId !== undefined ? book.libraryId : ""
                books.push(newBook)
                changed = true
            }
        })

        if (changed) {
            fs.writeJsonSync(booksFile, books, { spaces: 2 })
            console.log(`[DataManager] Bulk save complete for ${username}. Total books: ${books.length}`)
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

    public importBooks(username: string, importedBooks: Book[], mode: 'merge' | 'replace') {
        const { books: booksFile } = this.getUserPaths(username)
        let currentBooks = this.getAllBooks(username)

        console.log(`[DataManager] Importing ${importedBooks.length} books for ${username} in mode: ${mode}`)

        // Always backup first
        this.createBackup(currentBooks, username)

        // Normalize and reset libraryId to ensure they are visible (unassigned)
        const preparedBooks = importedBooks.map(bookInput => {
            const book = this.normalizeBook(bookInput)
            let newCoverPath = book.coverPath
            if (newCoverPath && newCoverPath.startsWith('local:')) {
                const parts = newCoverPath.split(':')
                if (parts.length === 3) {
                    newCoverPath = `local:${username}:${parts[2]}`
                }
            }

            return {
                ...book,
                isbn: this.normalizeIsbn(book.isbn),
                coverPath: newCoverPath,
                // Reset libraryId so they appear in "Unassigned"
                libraryId: "",
                // Ensure dates exist (already handled by normalizeBook but being explicit)
                createdAt: book.createdAt || new Date().toISOString(),
                updatedAt: book.updatedAt || new Date().toISOString()
            }
        })

        if (mode === 'replace') {
            fs.writeJsonSync(booksFile, preparedBooks, { spaces: 2 })
            return preparedBooks
        } else {
            // Merge mode using existing saveBooks logic which handles updates/inserts
            return this.saveBooks(username, preparedBooks)
        }
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
