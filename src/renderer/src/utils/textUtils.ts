/**
 * Normaliza y sanitiza un texto para búsquedas insensibles a mayúsculas,
 * acentos/tildes, diacríticos y símbolos/puntuación.
 */
export const normalizeText = (text?: string | null): string => {
    if (!text) return ''
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Elimina tildes y marcas diacríticas
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, ' ') // Reemplaza signos de puntuación y símbolos por espacios
        .replace(/\s+/g, ' ') // Colapsa múltiples espacios en uno
        .trim()
}

export interface SearchableBook {
    title?: string
    authors?: string[]
    publisher?: string
    isbn?: string
    barcode?: string
}

/**
 * Comprueba si un libro coincide con una búsqueda, evaluando:
 * - Título
 * - Autores
 * - Editorial (publisher)
 * - ISBN y Código de barras (ignorando guiones y espacios)
 *
 * Admite múltiples palabras clave (ej: "acme robin" o "ficcion minotauro"),
 * donde cada palabra debe encontrarse en los datos del libro.
 */
export const matchesBookSearch = (book: SearchableBook, query: string): boolean => {
    if (!query || !query.trim()) return true

    // 1. Verificación rápida de código directo (ISBN / Barcode) sin guiones ni espacios
    const cleanRawQuery = query.replace(/[-\s]/g, '').toLowerCase()
    const cleanIsbn = (book.isbn || '').replace(/[-\s]/g, '').toLowerCase()
    const cleanBarcode = (book.barcode || '').replace(/[-\s]/g, '').toLowerCase()

    if (cleanRawQuery && (cleanIsbn.includes(cleanRawQuery) || cleanBarcode.includes(cleanRawQuery))) {
        return true
    }

    // 2. Búsqueda por texto normalizado
    const normalizedQuery = normalizeText(query)
    if (!normalizedQuery) {
        return false
    }

    const terms = normalizedQuery.split(/\s+/).filter(Boolean)
    if (terms.length === 0) return true

    const title = normalizeText(book.title)
    const authors = Array.isArray(book.authors)
        ? book.authors.map(a => normalizeText(a)).join(' ')
        : ''
    const publisher = normalizeText(book.publisher)
    const fullText = `${title} ${authors} ${publisher} ${cleanIsbn} ${cleanBarcode}`
    const fullTextNoSpaces = fullText.replace(/\s+/g, '')

    return terms.every(term => fullText.includes(term) || fullTextNoSpaces.includes(term))
}
