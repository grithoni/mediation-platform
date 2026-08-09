import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../server/database/schema'

// Nitro 全局占位：让路由模块能在纯 Node 测试环境（node --test + tsx）中导入。
// 必须在动态 import 之前赋值（ESM import 会先于模块体执行）。
;(globalThis as any).defineEventHandler = (h: unknown) => h
;(globalThis as any).createError = (opts: any) =>
  Object.assign(new Error(opts?.message || 'error'), { statusCode: opts?.statusCode })

const { runMigrations } = await import('../server/database/migrate')
const { createCaseWithFiles } = await import('../server/api/cases/create.post')

const ALL_TABLES = [
  'tenants', 'users', 'cases', 'messages', 'documents', 'sessions',
  'saved_conversations', 'case_dynamic_files', 'case_applications', 'case_analyses',
  'mcp_tools', 'agreements', 'agreement_signatures', 'case_activities', 'case_notes',
  'settlement_proposals', 'webhooks', 'webhook_logs', 'case_creation_requests',
]

interface TempCtx {
  db: ReturnType<typeof drizzle>
  sqlite: Database.Database
  dir: string
}

function withTempDb<T>(fn: (ctx: TempCtx) => T | Promise<T>): Promise<T> {
  const previousCwd = process.cwd()
  const dir = mkdtempSync(join(tmpdir(), 'case-creation-test-'))
  process.chdir(dir)
  const sqlite = new Database(join(dir, 'test.db'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  return Promise.resolve(fn({ db, sqlite, dir })).finally(() => {
    sqlite.close()
    process.chdir(previousCwd)
    rmSync(dir, { recursive: true, force: true })
  })
}

function tableNames(sqlite: Database.Database): string[] {
  const rows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
  return (rows as Array<{ name: string }>).map((r) => r.name)
}

// cases.tenant_id 外键指向 tenants，建案前需要默认租户
function seedDefaultTenant(sqlite: Database.Database): void {
  sqlite
    .prepare("INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES ('tenant-default', '默认租户', 'default', 1, 1)")
    .run()
}

// ============================================================
// migrate.ts：幂等、非破坏
// ============================================================
test('runMigrations creates full schema and is re-runnable without dropping data', () => {
  return withTempDb(({ sqlite }) => {
    // 手动控制迁移时机：本测试自行调用 runMigrations
    const first = runMigrations(sqlite)

    const tables = tableNames(sqlite)
    for (const t of ALL_TABLES) {
      assert.ok(tables.includes(t), `missing table: ${t}`)
    }
    // 新增表应出现在 createdTables 中
    assert.ok(first.createdTables.includes('case_applications'))
    assert.ok(first.createdTables.includes('case_analyses'))
    assert.ok(first.createdTables.includes('case_creation_requests'))
    assert.equal(first.normalizedDocPaths, 0)

    // 插入一行后再次运行：数据保留，且没有新的建表/加列动作
    sqlite
      .prepare("INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES ('t1', 'T', 't1', 1, 1)")
      .run()
    const second = runMigrations(sqlite)
    assert.deepEqual(second.createdTables, [])
    assert.deepEqual(second.addedColumns, [])
    assert.equal(second.normalizedDocPaths, 0)

    const row = sqlite.prepare("SELECT id FROM tenants WHERE id = 't1'").get() as { id: string }
    assert.equal(row.id, 't1')
  })
})

test('runMigrations upgrades an old database without dropping data', () => {
  return withTempDb(({ sqlite }) => {
    // 模拟历史 migrate.ts 生成的旧库：documents 无 category、case_dynamic_files 无 agent 字段、    // 且缺少 case_applications / case_analyses / case_creation_requests
    sqlite.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        path TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        uploaded_by TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE case_dynamic_files (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        party_analysis TEXT,
        timeline TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    sqlite
      .prepare(
        "INSERT INTO documents (id, case_id, filename, original_name, path, created_at) VALUES ('d1', '2026-1', 'f.pdf', 'f.pdf', '/abs/outside/uploads/f.pdf', 1)",
      )
      .run()
    sqlite
      .prepare("INSERT INTO case_dynamic_files (id, case_id, created_at, updated_at) VALUES ('cdf1', '2026-1', 1, 1)")
      .run()

    const result = runMigrations(sqlite)

    assert.ok(result.addedColumns.includes('documents.category'))
    // agent_* 列已从功能中移除（VALUE 预分析摘要已删除），迁移不应再添加
    assert.equal(result.addedColumns.includes('case_dynamic_files.agent_status'), false)
    assert.equal(result.addedColumns.includes('case_dynamic_files.agent_analysis'), false)
    assert.equal(result.addedColumns.includes('case_dynamic_files.material_checklist'), false)
    assert.equal(result.addedColumns.includes('case_dynamic_files.agent_updated_at'), false)
    assert.ok(result.createdTables.includes('case_applications'))
    assert.ok(result.createdTables.includes('case_analyses'))
    assert.ok(result.createdTables.includes('case_creation_requests'))

    // 数据保留；cwd 之外的绝对路径不重写（非破坏性）
    const doc = sqlite.prepare("SELECT * FROM documents WHERE id = 'd1'").get() as { filename: string; path: string }
    assert.equal(doc.filename, 'f.pdf')
    assert.equal(doc.path, '/abs/outside/uploads/f.pdf')
    const cdf = sqlite.prepare("SELECT * FROM case_dynamic_files WHERE id = 'cdf1'").get() as { id: string }
    assert.equal(cdf.id, 'cdf1')
  })
})

test('runMigrations normalizes absolute documents.path under cwd to relative', () => {
  return withTempDb(({ sqlite, dir }) => {
    runMigrations(sqlite)
    // documents.case_id 有外键，先建一条案件记录
    sqlite
      .prepare(
        "INSERT INTO cases (id, title, party_a_name, party_b_name, access_code, created_at, updated_at) VALUES ('2026-1', 't', 'a', 'b', '123', 1, 1)",
      )
      .run()
    const absPath = join(process.cwd(), 'uploads', 'cases', '2026-1', 'a.pdf')
    sqlite
      .prepare(
        "INSERT INTO documents (id, case_id, filename, original_name, path, created_at) VALUES ('d1', '2026-1', 'a.pdf', 'a.pdf', ?, 1)",
      )
      .run(absPath)

    const result = runMigrations(sqlite)
    assert.equal(result.normalizedDocPaths, 1)
    const doc = sqlite.prepare("SELECT path FROM documents WHERE id = 'd1'").get() as { path: string }
    assert.equal(doc.path, 'uploads/cases/2026-1/a.pdf')
  })
})

// ============================================================
// create.post.ts：建案 / 幂等 / 清理
// ============================================================

const baseInput = {
  caseType: 'mediation',
  partyName: '张三',
  respondentName: '李四',
  disputeType: 'contract',
  description: '货款纠纷',
  appFields: { applicantName: '张三', caseFacts: '李四拖欠货款' },
  files: [{ name: '申请书.docx', data: Buffer.from('hello'), type: 'application/octet-stream', category: 'application' }],
}

test('createCaseWithFiles creates case, application and files with relative paths', () => {
  return withTempDb(({ db, sqlite, dir }) => {
    runMigrations(sqlite)
    seedDefaultTenant(sqlite)
    const year = new Date().getFullYear()
    const outcome = createCaseWithFiles(db, baseInput)

    assert.equal(outcome.created, true)
    assert.equal(outcome.result.success, true)
    assert.equal(outcome.result.data.caseNumber, `${year}-1`)
    assert.equal(outcome.result.data.accessCode, '123')
    assert.equal(outcome.result.data.fileCount, 1)
    assert.equal(outcome.result.data.applicantName, '张三')

    // 文件落盘且 documents.path 为相对路径（读取方 join(process.cwd(), path) 兼容）
    const rel = `uploads/cases/${year}-1/申请书.docx`
    assert.equal(existsSync(join(dir, rel)), true)
    const doc = db.select().from(schema.documents).where(eq(schema.documents.caseId, `${year}-1`)).get()
    assert.equal(doc?.path, rel)
  })
})

test('createCaseWithFiles dedupes on repeated requestId without re-writing', () => {
  return withTempDb(({ db, sqlite }) => {
    runMigrations(sqlite)
    seedDefaultTenant(sqlite)
    const first = createCaseWithFiles(db, { ...baseInput, requestId: 'req-1' })
    assert.equal(first.created, true)

    const second = createCaseWithFiles(db, { ...baseInput, requestId: 'req-1' })
    assert.equal(second.created, false)
    assert.equal(second.result.data.caseNumber, first.result.data.caseNumber)
    assert.equal(second.result.data.fileCount, 1)
    assert.equal(second.result.data.applicantName, '张三')

    // 未产生第二条案件/文件记录
    assert.equal(db.select().from(schema.cases).all().length, 1)
    assert.equal(db.select().from(schema.documents).all().length, 1)
    assert.equal(db.select().from(schema.caseApplications).all().length, 1)
  })
})

test('createCaseWithFiles without requestId behaves as before (old client)', () => {
  return withTempDb(({ db, sqlite }) => {
    runMigrations(sqlite)
    seedDefaultTenant(sqlite)
    const a = createCaseWithFiles(db, { ...baseInput, files: [] })
    const b = createCaseWithFiles(db, { ...baseInput, files: [] })
    assert.equal(a.created, true)
    assert.equal(b.created, true)
    assert.notEqual(a.result.data.caseNumber, b.result.data.caseNumber)
    assert.equal(db.select().from(schema.cases).all().length, 2)
  })
})

test('createCaseWithFiles cleans up records and idempotency claim on failure, retry succeeds', () => {
  return withTempDb(({ db, sqlite, dir }) => {
    runMigrations(sqlite)
    seedDefaultTenant(sqlite)
    const year = new Date().getFullYear()
    const caseNumber = `${year}-1`

    // 用同名普通文件占住上传目录路径 → mkdirSync 抛错，模拟建案中途失败
    const uploadsDir = join(dir, 'uploads', 'cases')
    mkdirSync(uploadsDir, { recursive: true })
    writeFileSync(join(uploadsDir, caseNumber), 'block')

    assert.throws(() => {
      createCaseWithFiles(db, { ...baseInput, requestId: 'req-fail' })
    })

    // 案件/申请详情/幂等占位全部回滚
    assert.equal(db.select().from(schema.cases).all().length, 0)
    assert.equal(db.select().from(schema.caseApplications).all().length, 0)
    const ledger = (db.$client as Database.Database)
      .prepare('SELECT * FROM case_creation_requests')
      .all()
    assert.equal(ledger.length, 0)

    // 解除阻塞后，同一 requestId 可成功重试
    rmSync(join(uploadsDir, caseNumber))
    const retry = createCaseWithFiles(db, { ...baseInput, files: [], requestId: 'req-fail' })
    assert.equal(retry.created, true)
    assert.equal(retry.result.data.caseNumber, caseNumber)
  })
})
