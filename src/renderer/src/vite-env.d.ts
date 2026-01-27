declare module '*.png' {
    const value: string
    export default value
}

declare global {
    interface Window {
        electron: {
            getBooks: () => Promise<any[]>
            saveBook: (book: any) => Promise<any>
            deleteBook: (isbn: string) => Promise<any[]>
            bulkSaveBooks: (books: any[]) => Promise<any[]>
            bulkDeleteBooks: (isbns: string[]) => Promise<any[]>
            onUpdate: (callback: (event: any, books: any[]) => void) => void
            getServerInfo: () => Promise<{ ip: string; port: number }>
            getConfig: () => Promise<any>
            saveConfig: (config: any) => Promise<any>
            onConfigUpdate: (callback: (event: any, config: any) => void) => void
            repairMetadata: (isbn: string) => Promise<any>
            scrapeMetadata: (url: string) => Promise<any>
        }
    }
}

export { }
