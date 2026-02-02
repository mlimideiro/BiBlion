export interface Book {
    isbn: string
    title: string
    authors: string[]
    publisher?: string
    description?: string
    coverPath?: string
    coverUrl?: string
    pageCount?: number
    libraryId?: string
    tags?: string[]
    status?: 'reading' | 'read' | 'borrowed' | 'available' | ''
    borrowerName?: string
    loanDate?: string
    createdAt?: string
    updatedAt?: string
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
