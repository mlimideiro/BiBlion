import fs from 'fs-extra'
import path from 'path'
import { BookMetadata } from './metadataService'

export class MetadataCache {
    private cacheDir: string

    constructor() {
        this.cacheDir = path.join(process.cwd(), 'db_biblion', 'cache', 'metadata')
        fs.ensureDirSync(this.cacheDir)
    }

    private getFilePath(isbn: string): string {
        const cleanIsbn = isbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
        return path.join(this.cacheDir, `${cleanIsbn}.json`)
    }

    public get(isbn: string): BookMetadata | null {
        const filePath = this.getFilePath(isbn)
        if (fs.existsSync(filePath)) {
            try {
                const data = fs.readJsonSync(filePath)
                console.log(`[MetadataCache] Hit for ISBN: ${isbn}`)
                return data
            } catch (e) {
                console.warn(`[MetadataCache] Error reading cache for ${isbn}`, e)
            }
        }
        return null
    }

    public set(isbn: string, metadata: BookMetadata) {
        if (!isbn || !metadata) return
        const filePath = this.getFilePath(isbn)
        try {
            fs.writeJsonSync(filePath, metadata, { spaces: 2 })
            console.log(`[MetadataCache] Saved for ISBN: ${isbn}`)
        } catch (e) {
            console.warn(`[MetadataCache] Error writing cache for ${isbn}`, e)
        }
    }
}
