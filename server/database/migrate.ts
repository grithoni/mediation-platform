import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const dbPath = resolve(process.cwd(), '.data', 'mediation.db')

// Ensure data directory exists
const dataDir = resolve(process.cwd(), '.data')
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

console.log('Database path:', dbPath)
console.log('Run "pnpm db:seed" to populate with sample data.')
