import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

let _db: ReturnType<typeof drizzle> | null = null

function getDbPath(): string {
  // During Nuxt dev/build, use .data/mediation.db relative to project root
  return resolve(process.cwd(), '.data', 'mediation.db')
}

export function getDb() {
  if (_db) return _db

  const dbPath = getDbPath()

  // Ensure directory exists
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  _db = drizzle(sqlite, { schema })
  return _db
}
