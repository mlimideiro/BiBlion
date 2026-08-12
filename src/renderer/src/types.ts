export interface Book {
    isbn: string
    barcode?: string  // Código de barras (EAN-13), puede diferir del ISBN
    title: string
    authors: string[]
    publisher?: string
    description?: string
    coverPath?: string
    coverUrl?: string
    pageCount?: number
    libraryId?: string
    tags?: string[]
    status?: 'reading' | 'read' | 'borrowed' | 'available' | 'wishlist' | ''
    borrowerName?: string
    loanDate?: string
    wishlistPrice?: string
    wishlistLocation?: string
    wishlistPriority?: number // 1-3
    wishlistNotes?: string
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
