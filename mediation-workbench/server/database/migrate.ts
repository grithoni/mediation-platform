import { existsSync, mkdirSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'

// ============================================================
// 安全、幂等、可重复执行的数据库迁移
//
// 原则：
//  - 绝不 DROP 全表（历史版本会 DROP 后重建，导致用户数据丢失）。
//  - 所有建表使用 CREATE TABLE IF NOT EXISTS，与 drizzle schema.ts 保持一致。
//  - 对已存在的旧表缺失的列，通过 PRAGMA table_info 探测后增量 ALTER（ADD COLUMN IF MISSING）。
//  - documents.path 统一为相对项目数据路径：仅当存量路径为绝对路径且位于当前工作目录
//    之下时才改写为相对路径（否则跳过，保证非破坏性）。
//  - 导出 runMigrations(db) 供 CLI 与测试复用。
// ============================================================

export interface MigrationResult {
  createdTables: string[]
  addedColumns: string[]
  normalizedDocPaths: number
}

function tableExists(db: Database.Database, table: string): boolean {
  return !!db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  if (!tableExists(db, table)) return false
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return cols.some((c) => c.name === column)
}

function createTableIfMissing(db: Database.Database, table: string, ddl: string, result: MigrationResult): void {
  if (tableExists(db, table)) return
  db.exec(ddl)
  result.createdTables.push(table)
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, ddl: string, result: MigrationResult): void {
  if (!tableExists(db, table) || columnExists(db, table, column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  result.addedColumns.push(`${table}.${column}`)
}

/**
 * 幂等迁移：安全地在任意状态的数据库上执行，可重复运行，不会删除任何数据。
 */
export function runMigrations(db: Database.Database): MigrationResult {
  const result: MigrationResult = { createdTables: [], addedColumns: [], normalizedDocPaths: 0 }

  // ============================================================
  // 租户表
  // ============================================================
  createTableIfMissing(db, 'tenants', `
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
  `, result)

  // ============================================================
  // 统一用户表
  // ============================================================
  createTableIfMissing(db, 'users', `
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
  `, result)

  // ============================================================
  // 案件表 (扩展版)
  // ============================================================
  createTableIfMissing(db, 'cases', `
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
  `, result)

  // ============================================================
  // 消息表 (扩展版)
  // ============================================================
  createTableIfMissing(db, 'messages', `
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
  `, result)

  // ============================================================
  // 文件表
  // ============================================================
  createTableIfMissing(db, 'documents', `
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id),
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      uploaded_by TEXT,
      category TEXT DEFAULT 'application',
      created_at INTEGER NOT NULL
    )
  `, result)
  // 旧库可能缺少 category 列（历史 migrate.ts 未包含）
  addColumnIfMissing(db, 'documents', 'category', `category TEXT DEFAULT 'application'`, result)

  // ============================================================
  // 对话会话表
  // ============================================================
  createTableIfMissing(db, 'sessions', `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id),
      party_identifier TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      ended_at INTEGER
    )
  `, result)

  // ============================================================
  // 已保存对话表
  // ============================================================
  createTableIfMissing(db, 'saved_conversations', `
    CREATE TABLE IF NOT EXISTS saved_conversations (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id),
      mediator_id TEXT,
      title TEXT NOT NULL,
      messages_json TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `, result)

  // ============================================================
  // 案件动态分析文件表
  // ============================================================
  createTableIfMissing(db, 'case_dynamic_files', `
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
      agent_status TEXT NOT NULL DEFAULT 'pending',
      agent_analysis TEXT,
      material_checklist TEXT,
      agent_updated_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `, result)
  // 旧库可能缺少外部 Agent 回写字段
  addColumnIfMissing(db, 'case_dynamic_files', 'agent_status', `agent_status TEXT NOT NULL DEFAULT 'pending'`, result)
  addColumnIfMissing(db, 'case_dynamic_files', 'agent_analysis', `agent_analysis TEXT`, result)
  addColumnIfMissing(db, 'case_dynamic_files', 'material_checklist', `material_checklist TEXT`, result)
  addColumnIfMissing(db, 'case_dynamic_files', 'agent_updated_at', `agent_updated_at INTEGER`, result)

  // ============================================================
  // 调解申请详情表 (1:1 关联 cases；申请表单已迁入工作台，原 3006 服务已退役)
  // ============================================================
  createTableIfMissing(db, 'case_applications', `
    CREATE TABLE IF NOT EXISTS case_applications (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id),
      applicant_name TEXT,
      applicant_address TEXT,
      applicant_postal_code TEXT,
      applicant_phone TEXT,
      applicant_mobile TEXT,
      applicant_fax TEXT,
      applicant_email TEXT,
      applicant_other_contact TEXT,
      respondent_name TEXT,
      respondent_address TEXT,
      respondent_postal_code TEXT,
      respondent_phone TEXT,
      respondent_mobile TEXT,
      respondent_fax TEXT,
      respondent_email TEXT,
      respondent_other_contact TEXT,
      mediation_willingness TEXT,
      case_facts TEXT,
      dispute_matters TEXT,
      mediation_demands TEXT,
      demands_basis TEXT,
      evidence_confidential INTEGER DEFAULT 0,
      has_agent INTEGER DEFAULT 0,
      agent_name TEXT,
      agent_duties TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `, result)

  // ============================================================
  // AI 分析缓存表
  // ============================================================
  createTableIfMissing(db, 'case_analyses', `
    CREATE TABLE IF NOT EXISTS case_analyses (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id),
      analysis_type TEXT NOT NULL,
      content TEXT NOT NULL,
      generated_at INTEGER NOT NULL
    )
  `, result)

  // ============================================================
  // MCP 工具配置表
  // ============================================================
  createTableIfMissing(db, 'mcp_tools', `
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
  `, result)

  // ============================================================
  // 调解协议表
  // ============================================================
  createTableIfMissing(db, 'agreements', `
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
  `, result)

  // ============================================================
  // 电子签署记录表
  // ============================================================
  createTableIfMissing(db, 'agreement_signatures', `
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
  `, result)

  // ============================================================
  // 案件活动日志表
  // ============================================================
  createTableIfMissing(db, 'case_activities', `
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
  `, result)

  // ============================================================
  // 调解员笔记表
  // ============================================================
  createTableIfMissing(db, 'case_notes', `
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
  `, result)

  // ============================================================
  // 和解方案表
  // ============================================================
  createTableIfMissing(db, 'settlement_proposals', `
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
  `, result)

  // ============================================================
  // Webhook 配置表
  // ============================================================
  createTableIfMissing(db, 'webhooks', `
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
  `, result)

  // ============================================================
  // Webhook 日志表
  // ============================================================
  createTableIfMissing(db, 'webhook_logs', `
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
  `, result)

  // ============================================================
  // 脱敏映射加密存储（对齐已退役 case-mcp-server/mapping_store.py）
  // 表由 desensitization-store.ts 读写：mapping_enc 为 AES-256-GCM 加密后的 JSON。
  // ============================================================
  createTableIfMissing(db, 'desensitization_mappings', `
    CREATE TABLE IF NOT EXISTS desensitization_mappings (
      trace_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      mapping_enc TEXT NOT NULL,
      categories TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `, result)

  // ============================================================
  // 建案幂等台账表（requestId → case_id）
  // 无外键：先占位后建案，创建失败时清理占位，避免与 cases 的引用冲突。
  // ============================================================
  createTableIfMissing(db, 'case_creation_requests', `
    CREATE TABLE IF NOT EXISTS case_creation_requests (
      request_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `, result)

  // ============================================================
  // 创建索引（幂等）
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
      CREATE INDEX IF NOT EXISTS idx_case_applications_case ON case_applications(case_id);
      CREATE INDEX IF NOT EXISTS idx_case_analyses_case ON case_analyses(case_id);
      CREATE INDEX IF NOT EXISTS idx_creation_requests_case ON case_creation_requests(case_id);
    `)
  } catch (e: any) {
    console.warn('⚠ Some indexes may already exist:', e?.message)
  }

  // ============================================================
  // documents.path 统一为相对项目数据路径（仅改写位于当前工作目录之下的绝对路径）
  // ============================================================
  if (tableExists(db, 'documents') && columnExists(db, 'documents', 'path')) {
    const cwd = process.cwd()
    const rows = db.prepare('SELECT id, path FROM documents WHERE path IS NOT NULL AND path != ?').all('')
    const update = db.prepare('UPDATE documents SET path = ? WHERE id = ?')
    for (const row of rows as Array<{ id: string; path: string }>) {
      const p = row.path
      if (isAbsolute(p) && (p === cwd || p.startsWith(cwd + sep))) {
        const rel = p === cwd ? '.' : relative(cwd, p)
        update.run(rel, row.id)
        result.normalizedDocPaths += 1
      }
    }
  }

  return result
}

// ============================================================
// CLI 入口（pnpm db:migrate）
// ============================================================
function isCliEntry(): boolean {
  const argv1 = process.argv[1]
  if (!argv1) return false
  try {
    return import.meta.url === pathToFileURL(resolve(argv1)).href
  } catch {
    return false
  }
}

if (isCliEntry()) {
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

  const result = runMigrations(db)

  db.close()

  console.log(`✓ Tables ensured: ${result.createdTables.length > 0 ? result.createdTables.join(', ') : '(all already exist)'}`)
  if (result.addedColumns.length > 0) {
    console.log(`✓ Columns added: ${result.addedColumns.join(', ')}`)
  } else {
    console.log('✓ No missing columns')
  }
  console.log(`✓ Normalized documents.path rows: ${result.normalizedDocPaths}`)

  console.log('\n✅ Migration completed successfully!')
  console.log('Run "pnpm db:seed" to populate with sample data.')
}
