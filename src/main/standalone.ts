import { DataManager } from './dataManager'
import { startServer } from './server'
import { MetadataService } from './metadataService'
import { ScraperService } from './scraperService'

// Initialize core services
const dataManager = new DataManager()
const metadataService = new MetadataService()
const scraperService = new ScraperService()

console.log('--- BiBlion Cloud Server ---')
console.log('Initializing services...')

// Start the Express server
// In standalone mode, we don't need to notify a desktop window
startServer(dataManager, metadataService, scraperService, (newBook) => {
    console.log(`[Update] Book processed via mobile/API: ${newBook.title}`)
})

console.log('Ready for connections.')
