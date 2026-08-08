import fs from 'fs'
import path from 'path'
import fsExtra from 'fs-extra'
import axios from 'axios'
import { DataManager } from './dataManager'

export class AdminUtils {
  constructor(private dataManager: DataManager) {}

  async syncAllUserCovers(logCallback: (msg: string) => void) {
    const USERS_ROOT = path.join(process.cwd(), 'db_biblion', 'users')
    if (!fs.existsSync(USERS_ROOT)) {
      logCallback('Error: No users directory found.')
      return
    }

    const users = fs.readdirSync(USERS_ROOT).filter(f => 
       fs.statSync(path.join(USERS_ROOT, f)).isDirectory()
    )

    logCallback(`Encontrados ${users.length} usuarios. Iniciando sincronización...`)

    for (const username of users) {
      logCallback(`\n>>> Procesando usuario: [${username}]`)
      const books = this.dataManager.getAllBooks(username)
      let modified = false

      for (const book of books) {
        const cleanIsbn = book.isbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
        const coversDir = path.join(USERS_ROOT, username, 'covers')
        const expectedFilename = `${cleanIsbn}.jpg`
        const expectedLocalPath = path.join(coversDir, expectedFilename)
        const expectedCoverPath = `local:${username}:${expectedFilename}`

        // CASE 1: Book has an external URL in coverPath or coverUrl
        const url = book.coverPath?.startsWith('http') ? book.coverPath : book.coverUrl
        if (url && url.startsWith('http')) {
          if (!fs.existsSync(expectedLocalPath)) {
            logCallback(`  [Descarga] "${book.title}": Descargando desde ${url.substring(0, 30)}...`)
            try {
              const success = await this.downloadCover(url, expectedLocalPath)
              if (success) {
                book.coverUrl = url
                book.coverPath = expectedCoverPath
                modified = true
                logCallback(`  [OK] Descargado: ${expectedFilename}`)
              }
            } catch (e: any) {
              logCallback(`  [Error] Falló descarga de ${book.title}: ${e.message}`)
            }
          } else if (book.coverPath !== expectedCoverPath) {
            logCallback(`  [Fix] "${book.title}": Vinculando a archivo local existente.`)
            book.coverUrl = url
            book.coverPath = expectedCoverPath
            modified = true
          }
        }

        // CASE 2: book.coverPath is local but mismatch or manual/wish string
        if (book.coverPath?.startsWith('local:')) {
            const currentFilename = book.coverPath.split(':').pop() || ''
            
            // Check for MANUAL/WISH patterns in filename or mismatch with current ISBN
            const isManualPattern = currentFilename.toUpperCase().includes('MANUAL') || currentFilename.toUpperCase().includes('WISH')
            const isMismatch = (currentFilename !== expectedFilename && !isManualPattern)

            if ((isManualPattern || isMismatch) && currentFilename !== expectedFilename) {
                const currentLocalPath = path.join(coversDir, currentFilename)
                if (fs.existsSync(currentLocalPath)) {
                    logCallback(`  [Renombrado] "${book.title}": de ${currentFilename} a ${expectedFilename}`)
                    try {
                        fs.renameSync(currentLocalPath, expectedLocalPath)
                        book.coverPath = expectedCoverPath
                        modified = true
                    } catch (e: any) {
                        logCallback(`  [Error] No se pudo renombrar: ${e.message}`)
                    }
                } else if (isMismatch && fs.existsSync(expectedLocalPath)) {
                  // File already exists with new name, just update JSON
                  book.coverPath = expectedCoverPath
                  modified = true
                  logCallback(`  [Fix] "${book.title}": Ruta actualizada a ISBN actual (archivo ya existía).`)
                }
            }
        }
      }

      if (modified) {
        this.dataManager.saveBooks(username, books)
        logCallback(`  [Guardado] Libros de ${username} actualizados.`)
      } else {
        logCallback(`  [Info] Sin cambios pendientes para ${username}.`)
      }
    }

    logCallback('\n--- Sincronización Finalizada ---')
  }

  async optimizeGlobalImages(logCallback: (msg: string) => void) {
    const USERS_ROOT = path.join(process.cwd(), 'db_biblion', 'users')
    const SHARED_DIR = path.join(process.cwd(), 'db_biblion', 'covers', 'shared')
    fsExtra.ensureDirSync(SHARED_DIR)

    if (!fs.existsSync(USERS_ROOT)) {
      logCallback('Error: No users directory found.')
      return
    }

    const users = fs.readdirSync(USERS_ROOT).filter(f => 
       fs.statSync(path.join(USERS_ROOT, f)).isDirectory()
    )

    logCallback(`Iniciando Optimización Global entre ${users.length} usuarios...`)

    // 1. Collect candidates
    const isbnMap = new Map<string, Array<{ username: string, book: any, localPath: string, size: number }>>()

    for (const username of users) {
      const books = this.dataManager.getAllBooks(username)
      for (const book of books) {
        // Only process automatic covers with valid ISBN
        if (book.coverType === 'auto' && book.coverPath?.startsWith('local:')) {
          const cleanIsbn = book.isbn.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
          if (!cleanIsbn) continue

          const filename = book.coverPath.split(':').pop() || ''
          const localPath = path.join(USERS_ROOT, username, 'covers', filename)

          if (fs.existsSync(localPath)) {
            const stats = fs.statSync(localPath)
            const list = isbnMap.get(cleanIsbn) || []
            list.push({ username, book, localPath, size: stats.size })
            isbnMap.set(cleanIsbn, list)
          }
        }
      }
    }

    // 2. Process duplicates
    let totalMoved = 0
    let totalSaved = 0

    for (const [isbn, occurrences] of isbnMap.entries()) {
      if (occurrences.length > 1) {
        logCallback(`\n[ISBN: ${isbn}] Encontrado en ${occurrences.length} usuarios.`)
        
        // Pick best (largest size)
        occurrences.sort((a, b) => b.size - a.size)
        const best = occurrences[0]
        const sharedPath = path.join(SHARED_DIR, `${isbn}.jpg`)

        try {
          // Move best to shared (or just copy if we want to be safe)
          fs.copyFileSync(best.localPath, sharedPath)
          logCallback(`  -> Imagen compartida creada (${Math.round(best.size / 1024)} KB)`)

          // Update all users
          for (const occ of occurrences) {
            const userBooks = this.dataManager.getAllBooks(occ.username)
            const bookIndex = userBooks.findIndex(b => b.isbn === occ.book.isbn)
            
            if (bookIndex >= 0) {
              userBooks[bookIndex].coverPath = `global:${isbn}.jpg`
              this.dataManager.saveBooks(occ.username, userBooks)
              
              // Delete local copy
              if (fs.existsSync(occ.localPath)) {
                fs.unlinkSync(occ.localPath)
                totalSaved += occ.size
              }
              logCallback(`  [OK] Usuario ${occ.username} actualizado.`)
            }
          }
          totalMoved++
        } catch (e: any) {
          logCallback(`  [Error] Falló optimización para ${isbn}: ${e.message}`)
        }
      }
    }

    logCallback(`\n--- Optimización Finalizada ---`)
    logCallback(`Libros optimizados: ${totalMoved}`)
    logCallback(`Espacio recuperado: ${Math.round(totalSaved / 1024)} KB`)
  }

  private async downloadCover(url: string, dest: string): Promise<boolean> {
    try {
      let coverReferer = 'https://www.google.com/'
      try { coverReferer = new URL(url).origin + '/' } catch { /* keep default */ }

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': coverReferer,
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8'
        }
      })
      fsExtra.ensureDirSync(path.dirname(dest))
      fs.writeFileSync(dest, Buffer.from(response.data))
      return true
    } catch (e: any) {
      throw new Error(e.message || 'Error desconocido al descargar')
    }
  }
}
