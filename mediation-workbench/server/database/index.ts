import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

let _db: ReturnType<typeof drizzle> | null = null
let _sqlite: Database.Database | null = null

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

  _sqlite = sqlite
  _db = drizzle(sqlite, { schema })
  return _db
}

export function resetDb() {
  _db = null
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
  }
}

export function initTestDb() {
  const db = getDb()

  _sqlite?.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      dispute_type TEXT,
      amount REAL,
      party_a_name TEXT NOT NULL,
      party_b_name TEXT NOT NULL,
      party_a_contact TEXT,
      party_b_contact TEXT,
      party_a_user_id TEXT,
      party_b_user_id TEXT,
      claims_summary TEXT,
      evidence_summary TEXT,
      phase TEXT NOT NULL DEFAULT 'intake',
      status TEXT NOT NULL DEFAULT 'pending',
      mediator_id TEXT,
      mediator_bound_at INTEGER,
      mediator_requested_at INTEGER,
      access_code TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at INTEGER,
      review_note TEXT,
      closed_at INTEGER,
      close_reason TEXT,
      dynamic_file_updated_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      party_identifier TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS case_dynamic_files (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      party_analysis TEXT,
      timeline TEXT,
      dispute_checklist TEXT,
      positions TEXT,
      potential_interests TEXT,
      batna TEXT,
      issues TEXT,
      sentiment TEXT,
      settlement_suggestions TEXT,
      agent_log TEXT,
      dialog_turn_count INTEGER DEFAULT 0,
      dialog_ended INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS case_applications (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      applicant_name TEXT,
      applicant_address TEXT,
      respondent_name TEXT,
      respondent_address TEXT,
      case_facts TEXT,
      dispute_matters TEXT,
      mediation_demands TEXT,
      demands_basis TEXT,
      agent_name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      uploaded_by TEXT,
      category TEXT DEFAULT 'application',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS case_analyses (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      analysis_type TEXT NOT NULL,
      content TEXT NOT NULL,
      generated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS desensitization_mappings (
      trace_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      mapping_enc TEXT NOT NULL,
      categories TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS case_desensitize_rules (
      case_id TEXT PRIMARY KEY,
      rules_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  return db
}
