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
        const cleanIsbn = book.isbn.replace(/[^a-zA-Z0-9]/g, '')
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

            if (isManualPattern || isMismatch) {
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

  private async downloadCover(url: string, dest: string): Promise<boolean> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      })
      fsExtra.ensureDirSync(path.dirname(dest))
      fs.writeFileSync(dest, Buffer.from(response.data))
      return true
    } catch (e) {
      return false
    }
  }
}
