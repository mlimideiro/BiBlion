import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    getBooks: (username?: string) => ipcRenderer.invoke('get-books', username),
    saveBook: ({ username, book }: { username?: string, book: any }) => ipcRenderer.invoke('save-book', { username, book }),
    deleteBook: ({ username, isbn }: { username?: string, isbn: string }) => ipcRenderer.invoke('delete-book', { username, isbn }),
    bulkSaveBooks: ({ username, books }: { username?: string, books: any[] }) => ipcRenderer.invoke('bulk-save-books', { username, books }),
    bulkDeleteBooks: ({ username, isbns }: { username?: string, isbns: string[] }) => ipcRenderer.invoke('bulk-delete-books', { username, isbns }),
    onUpdate: (callback: any) => ipcRenderer.on('books-updated', (_event, value) => callback(value)), // Make sure callback gets value
    getServerInfo: () => ipcRenderer.invoke('get-server-info'),

    // New Library & Config API
    getConfig: (username?: string) => ipcRenderer.invoke('get-config', username),
    saveConfig: ({ username, config }: { username?: string, config: any }) => ipcRenderer.invoke('save-config', { username, config }),
    onConfigUpdate: (callback: any) => ipcRenderer.on('config-updated', (_event, value) => callback(value)),

    // Metadata Repair
    repairMetadata: (isbn: string) => ipcRenderer.invoke('repair-metadata', isbn),
    scrapeMetadata: (url: string) => ipcRenderer.invoke('scrape-metadata', url),
    login: (credentials: any) => ipcRenderer.invoke('login', credentials),
    getUsers: () => ipcRenderer.invoke('get-users'),
    createUser: (user: any) => ipcRenderer.invoke('create-user', user),
    updateUser: (user: any) => ipcRenderer.invoke('update-user', user),
    deleteUser: (user: any) => ipcRenderer.invoke('delete-user', user)
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
