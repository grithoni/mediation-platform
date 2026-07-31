import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'

const dbPath = resolve(process.cwd(), '.data', 'mediation.db')

// Ensure data directory exists
const dataDir = resolve(process.cwd(), '.data')
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

console.log('Database path:', dbPath)
console.log('Running migrations...')

const db = new Database(dbPath)

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Drop existing tables (for clean migration)
console.log('Dropping existing tables...')
db.pragma('foreign_keys = OFF')
db.exec(`
  DROP TABLE IF EXISTS webhook_logs;
  DROP TABLE IF EXISTS webhooks;
  DROP TABLE IF EXISTS settlement_proposals;
  DROP TABLE IF EXISTS case_notes;
  DROP TABLE IF EXISTS case_activities;
  DROP TABLE IF EXISTS agreement_signatures;
  DROP TABLE IF EXISTS agreements;
  DROP TABLE IF EXISTS mcp_tools;
  DROP TABLE IF EXISTS case_dynamic_files;
  DROP TABLE IF EXISTS saved_conversations;
  DROP TABLE IF EXISTS sessions;
  DROP TABLE IF EXISTS documents;
  DROP TABLE IF EXISTS messages;
  DROP TABLE IF EXISTS cases;
  DROP TABLE IF EXISTS users;
  DROP TABLE IF EXISTS tenants;
`)
db.pragma('foreign_keys = ON')
console.log('✓ Dropped existing tables')

// ============================================================
// 租户表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo TEXT,
    primary_color TEXT DEFAULT '#3B82F6',
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    max_cases INTEGER DEFAULT 100,
    max_storage_mb INTEGER DEFAULT 1024,
    max_api_calls INTEGER DEFAULT 10000,
    ai_model TEXT DEFAULT 'gpt-4o-mini',
    ai_enabled INTEGER DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
console.log('✓ Created tenants table')

// ============================================================
// 统一用户表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id),
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    phone TEXT,
    password_hash TEXT,
    avatar TEXT,
    wx_open_id TEXT,
    wx_union_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
console.log('✓ Created users table')

// ============================================================
// 案件表 (扩展版)
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id),
    title TEXT NOT NULL,
    description TEXT,
    dispute_type TEXT,
    amount REAL,
    party_a_name TEXT NOT NULL,
    party_b_name TEXT NOT NULL,
    party_a_contact TEXT,
    party_b_contact TEXT,
    party_a_user_id TEXT REFERENCES users(id),
    party_b_user_id TEXT REFERENCES users(id),
    claims_summary TEXT,
    evidence_summary TEXT,
    phase TEXT NOT NULL DEFAULT 'intake',
    status TEXT NOT NULL DEFAULT 'pending',
    mediator_id TEXT REFERENCES users(id),
    mediator_bound_at INTEGER,
    mediator_requested_at INTEGER,
    access_code TEXT NOT NULL,
    reviewed_by TEXT REFERENCES users(id),
    reviewed_at INTEGER,
    review_note TEXT,
    closed_at INTEGER,
    close_reason TEXT,
    dynamic_file_updated_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
  console.log('✓ Created cases table')

  // ============================================================
  // 消息表 (扩展版)
  // ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    sender_type TEXT NOT NULL,
    sender_id TEXT,
    sender_name TEXT,
    content TEXT NOT NULL,
    metadata TEXT,
    channel_type TEXT NOT NULL DEFAULT 'shared',
    caucus_session_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'shared',
    created_at INTEGER NOT NULL
  )
`)
console.log('✓ Created messages table')

// ============================================================
// 文件表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    uploaded_by TEXT,
    created_at INTEGER NOT NULL
  )
`)
console.log('✓ Created documents table')

// ============================================================
// 对话会话表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    party_identifier TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    ended_at INTEGER
  )
`)
console.log('✓ Created sessions table')

// ============================================================
// 已保存对话表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS saved_conversations (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    mediator_id TEXT,
    title TEXT NOT NULL,
    messages_json TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`)
console.log('✓ Created saved_conversations table')

// ============================================================
// 案件动态分析文件表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS case_dynamic_files (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
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
  )
`)
console.log('✓ Created case_dynamic_files table')

// ============================================================
// MCP 工具配置表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS mcp_tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    transport TEXT NOT NULL,
    command TEXT,
    url TEXT,
    env_json TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
console.log('✓ Created mcp_tools table')

// ============================================================
// 调解协议表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS agreements (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    tenant_id TEXT REFERENCES tenants(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    performance_plan TEXT,
    breach_clauses TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    previous_version_id TEXT,
    approved_by_party_a INTEGER DEFAULT 0,
    approved_by_party_b INTEGER DEFAULT 0,
    approved_at INTEGER,
    created_by TEXT REFERENCES users(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
console.log('✓ Created agreements table')

// ============================================================
// 电子签署记录表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS agreement_signatures (
    id TEXT PRIMARY KEY,
    agreement_id TEXT NOT NULL REFERENCES agreements(id),
    case_id TEXT NOT NULL REFERENCES cases(id),
    signer_type TEXT NOT NULL,
    signer_id TEXT NOT NULL,
    signer_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    external_task_id TEXT,
    external_sign_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    signed_at INTEGER,
    sign_url TEXT,
    certificate_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
console.log('✓ Created agreement_signatures table')

// ============================================================
// 案件活动日志表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS case_activities (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    tenant_id TEXT REFERENCES tenants(id),
    activity_type TEXT NOT NULL,
    description TEXT NOT NULL,
    performed_by TEXT REFERENCES users(id),
    performed_by_name TEXT,
    related_id TEXT,
    related_type TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL
  )
`)
console.log('✓ Created case_activities table')

// ============================================================
// 调解员笔记表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS case_notes (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    content TEXT NOT NULL,
    note_type TEXT NOT NULL DEFAULT 'general',
    is_private INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_by_name TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
console.log('✓ Created case_notes table')

// ============================================================
// 和解方案表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS settlement_proposals (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    tenant_id TEXT REFERENCES tenants(id),
    title TEXT NOT NULL,
    description TEXT,
    terms TEXT NOT NULL,
    amount REAL,
    performance_method TEXT,
    performance_deadline TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    proposed_by TEXT REFERENCES users(id),
    proposed_by_name TEXT,
    party_a_attitude TEXT,
    party_b_attitude TEXT,
    is_ai_generated INTEGER DEFAULT 0,
    ai_confidence REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
console.log('✓ Created settlement_proposals table')

// ============================================================
// Webhook 配置表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id),
    url TEXT NOT NULL,
    secret TEXT,
    events TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_triggered_at INTEGER,
    failure_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
console.log('✓ Created webhooks table')

// ============================================================
// Webhook 日志表
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS webhook_logs (
    id TEXT PRIMARY KEY,
    webhook_id TEXT NOT NULL REFERENCES webhooks(id),
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    success INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`)
console.log('✓ Created webhook_logs table')

// ============================================================
// 创建索引
// ============================================================
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_cases_tenant ON cases(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_cases_phase ON cases(phase);
    CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
    CREATE INDEX IF NOT EXISTS idx_cases_mediator ON cases(mediator_id);
    CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id);
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_type);
    CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);
    CREATE INDEX IF NOT EXISTS idx_agreements_case ON agreements(case_id);
    CREATE INDEX IF NOT EXISTS idx_agreements_status ON agreements(status);
    CREATE INDEX IF NOT EXISTS idx_case_activities_case ON case_activities(case_id);
    CREATE INDEX IF NOT EXISTS idx_case_notes_case ON case_notes(case_id);
    CREATE INDEX IF NOT EXISTS idx_settlement_proposals_case ON settlement_proposals(case_id);
  `)
  console.log('✓ Created indexes')
} catch (e: any) {
  console.log('⚠ Some indexes may already exist:', e.message)
}

db.close()

console.log('\n✅ Migration completed successfully!')
console.log('Run "pnpm db:seed" to populate with sample data.')
