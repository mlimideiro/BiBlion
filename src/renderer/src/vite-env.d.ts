/// <reference types="vite/client" />

declare module '*.png' {
    const value: string
    export default value
}

declare global {
    interface Window {
        electron: {
            getBooks: (username?: string) => Promise<any[]>
            saveBook: (arg: { username?: string, book: any }) => Promise<any>
            deleteBook: (arg: { username?: string, isbn: string }) => Promise<any[]>
            bulkSaveBooks: (arg: { username?: string, books: any[] }) => Promise<any[]>
            bulkDeleteBooks: (arg: { username?: string, isbns: string[] }) => Promise<any[]>
            onUpdate: (callback: (books: any[]) => void) => void
            getServerInfo: () => Promise<{ ip: string; port: number }>

            getConfig: (username?: string) => Promise<any>
            saveConfig: (arg: { username?: string, config: any }) => Promise<any>
            onConfigUpdate: (callback: (config: any) => void) => void

            repairMetadata: (isbn: string) => Promise<any>
            scrapeMetadata: (url: string) => Promise<any>

            login: (credentials: any) => Promise<any>
            getUsers: () => Promise<any[]>
            createUser: (user: any) => Promise<any>
            updateUser: (user: any) => Promise<any>
            deleteUser: (user: any) => Promise<any>
        }
    }
}

export { }
