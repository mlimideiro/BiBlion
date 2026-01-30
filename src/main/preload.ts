import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    getBooks: () => ipcRenderer.invoke('get-books'),
    saveBook: (book: any) => ipcRenderer.invoke('save-book', book),
    deleteBook: (isbn: string) => ipcRenderer.invoke('delete-book', isbn),
    bulkSaveBooks: (books: any[]) => ipcRenderer.invoke('bulk-save-books', books),
    bulkDeleteBooks: (isbns: string[]) => ipcRenderer.invoke('bulk-delete-books', isbns),
    onUpdate: (callback: any) => ipcRenderer.on('books-updated', callback),
    getServerInfo: () => ipcRenderer.invoke('get-server-info'),

    // New Library & Config API
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
    onConfigUpdate: (callback: any) => ipcRenderer.on('config-updated', callback),

    // Metadata Repair
    repairMetadata: (isbn: string) => ipcRenderer.invoke('repair-metadata', isbn),
    scrapeMetadata: (url: string) => ipcRenderer.invoke('scrape-metadata', url),
    login: (credentials: any) => ipcRenderer.invoke('login', credentials)
})

// Preload script
window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector: string, text: string) => {
        const element = document.getElementById(selector)
        if (element) element.innerText = text
    }

    for (const dependency of ['chrome', 'node', 'electron']) {
        replaceText(`${dependency}-version`, process.versions[dependency] || '')
    }
})
