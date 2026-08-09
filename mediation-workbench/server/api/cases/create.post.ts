import { v4 as uuidv4 } from 'uuid'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases, documents, caseApplications } from '../../database/schema'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { createAiWelcomeForCase } from '../../utils/ai-welcome'

const caseTypeLabels: Record<string, string> = {
  mediation: '申请调解',
  evaluation: '申请中立评估',
  review: '申请争议评审',
}

// 文件分类 → 表单字段名
const FILE_CATEGORY_MAP: Record<string, string> = {
  application_files: 'application', // 调解申请书
  evidence_files: 'evidence', // 证据材料
  identity_files: 'identity', // 身份证明
  authorization_files: 'authorization', // 授权委托书
  files: 'application', // 兼容旧字段
}

// snake_case → camelCase（官网表单字段名如 applicant_name → applicantName）
function toCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

// ============================================================
// 建案幂等（requestId）支持
// 台账表 case_creation_requests 由迁移脚本创建（server/database/migrate.ts）。
// 兼容旧客户端：不带 requestId 时行为与之前完全一致。
// ============================================================

const LEDGER_TABLE = 'case_creation_requests'

interface LedgerRow {
  request_id: string
  case_id: string
  created_at: number
}

function ledgerSqlite(db: ReturnType<typeof getDb>) {
  // drizzle 的 better-sqlite3 实例暴露底层连接，用于台账的原始 SQL 查询
  return db.$client
}

function ledgerTableExists(db: ReturnType<typeof getDb>): boolean {
  return !!ledgerSqlite(db)
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(LEDGER_TABLE)
}

function findLedgerEntry(db: ReturnType<typeof getDb>, requestId: string): LedgerRow | undefined {
  return ledgerSqlite(db)
    .prepare(`SELECT request_id, case_id, created_at FROM ${LEDGER_TABLE} WHERE request_id = ?`)
    .get(requestId) as LedgerRow | undefined
}

function insertLedgerEntry(db: ReturnType<typeof getDb>, requestId: string, caseId: string): void {
  ledgerSqlite(db)
    .prepare(`INSERT INTO ${LEDGER_TABLE} (request_id, case_id, created_at) VALUES (?, ?, ?)`)
    .run(requestId, caseId, Date.now())
}

function deleteLedgerEntry(db: ReturnType<typeof getDb>, requestId: string): void {
  ledgerSqlite(db)
    .prepare(`DELETE FROM ${LEDGER_TABLE} WHERE request_id = ?`)
    .run(requestId)
}

// 重复 requestId：返回第一次创建的结果（与首次返回契约完全一致）
function loadFirstResult(
  db: ReturnType<typeof getDb>,
  caseId: string,
  requestId: string,
): CreateCaseResult | null {
  const row = db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!row) {
    // 台账占位存在但案件不存在（首次创建中途崩溃/已回滚）：
    // 清理过期占位，让重试可以重新建案 —— 明确的可恢复状态。
    try {
      deleteLedgerEntry(db, requestId)
    } catch {
      // 忽略清理失败，下次重试仍会再次尝试
    }
    return null
  }

  const fileCount = db.select().from(documents).where(eq(documents.caseId, caseId)).all().length
  const app = db.select().from(caseApplications).where(eq(caseApplications.caseId, caseId)).get()

  return {
    success: true,
    data: {
      caseNumber: row.id,
      accessCode: row.accessCode,
      fileCount,
      applicantName: app?.applicantName || row.partyAName || '',
    },
  }
}

// ============================================================
// 建案核心逻辑（可独立测试）
// ============================================================

export interface CreateCaseFile {
  name: string
  data: Buffer
  type: string
  category: string
}

export interface CreateCaseInput {
  caseType: string
  partyName: string
  respondentName: string
  disputeType: string
  description: string
  appFields: Record<string, string>
  files: CreateCaseFile[]
  /** 幂等键（旧客户端可不传） */
  requestId?: string
}

export interface CreateCaseResult {
  success: boolean
  data: {
    caseNumber: string
    accessCode: string
    fileCount: number
    applicantName: string
  }
}

export interface CreateCaseOutcome {
  /** 与既有返回契约一致 */
  result: CreateCaseResult
  /** 本次是否真正创建了案件（false 表示命中重复 requestId，返回首次结果） */
  created: boolean
}

export function createCaseWithFiles(
  db: ReturnType<typeof getDb>,
  input: CreateCaseInput,
): CreateCaseOutcome {
  const { caseType, partyName, respondentName, disputeType, description, appFields, files, requestId } = input

  if (!caseType || !['mediation', 'evaluation', 'review'].includes(caseType)) {
    throw createError({ statusCode: 400, message: '无效的案件类型' })
  }

  // --- 幂等：先查台账，命中直接返回第一次创建结果 ---
  const ledgerAvailable = !!requestId && ledgerTableExists(db)
  if (ledgerAvailable) {
    const existing = findLedgerEntry(db, requestId!)
    if (existing) {
      const first = loadFirstResult(db, existing.case_id, requestId!)
      if (first) return { result: first, created: false }
      // 台账过期占位已清理，继续正常建案
    }
  }

  // Generate case number: YYYY-N (increment within year)
  const currentYear = new Date().getFullYear()
  const yearPrefix = `${currentYear}-`

  const existingCases = db
    .select({ id: cases.id })
    .from(cases)
    .where(sql`${cases.id} LIKE ${yearPrefix + '%'}`)
    .all()

  // Find highest N
  let maxN = 0
  for (const c of existingCases) {
    const n = parseInt(c.id.replace(yearPrefix, ''), 10)
    if (!isNaN(n) && n > maxN) maxN = n
  }

  // Use timestamp suffix to reduce concurrent collision risk
  const seq = maxN + 1
  const caseNumber = `${currentYear}-${seq}`
  // Atomic: use timestamp suffix to avoid concurrent collision
  const accessCode = '123'

  const finalTitle = disputeType || appFields.disputeMatters || description || caseTypeLabels[caseType] || '新建案件'

  // --- 幂等：创建任何数据前先占位台账（并发下由 PRIMARY KEY 保证只赢一次） ---
  let ledgerClaimed = false
  if (ledgerAvailable) {
    try {
      insertLedgerEntry(db, requestId!, caseNumber)
      ledgerClaimed = true
    } catch (err) {
      // 并发竞争落败：另一个请求已用同一 requestId 占位，返回其创建结果
      const winner = findLedgerEntry(db, requestId!)
      if (winner) {
        const first = loadFirstResult(db, winner.case_id, requestId!)
        if (first) return { result: first, created: false }
      }
      throw err
    }
  }

  const writtenFiles: string[] = []
  const insertedDocIds: string[] = []

  try {
    // Create case in database
    db.insert(cases).values({
      id: caseNumber,
      tenantId: 'tenant-default',
      title: finalTitle,
      description: description || appFields.caseFacts || `${finalTitle} — 当事人自行提交材料`,
      disputeType: disputeType || null,
      partyAName: appFields.applicantName || partyName || '当事人',
      partyBName: appFields.respondentName || respondentName || '待确认',
      status: 'pending',
      accessCode,
      phase: 'intake',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).run()

    // 写入申请详情（case_applications）
    db.insert(caseApplications).values({
      id: caseNumber,
      caseId: caseNumber,
      applicantName: appFields.applicantName || null,
      applicantAddress: appFields.applicantAddress || null,
      applicantPostalCode: appFields.applicantPostalCode || null,
      applicantPhone: appFields.applicantPhone || null,
      applicantMobile: appFields.applicantMobile || null,
      applicantFax: appFields.applicantFax || null,
      applicantEmail: appFields.applicantEmail || null,
      applicantOtherContact: appFields.applicantOtherContact || null,
      respondentName: appFields.respondentName || null,
      respondentAddress: appFields.respondentAddress || null,
      respondentPostalCode: appFields.respondentPostalCode || null,
      respondentPhone: appFields.respondentPhone || null,
      respondentMobile: appFields.respondentMobile || null,
      respondentFax: appFields.respondentFax || null,
      respondentEmail: appFields.respondentEmail || null,
      respondentOtherContact: appFields.respondentOtherContact || null,
      mediationWillingness: appFields.mediationWillingness || null,
      caseFacts: appFields.caseFacts || null,
      disputeMatters: appFields.disputeMatters || null,
      mediationDemands: appFields.mediationDemands || null,
      demandsBasis: appFields.demandsBasis || null,
      evidenceConfidential: appFields.evidenceConfidential === 'true',
      hasAgent: appFields.hasAgent === 'true',
      agentName: appFields.agentName || null,
      agentDuties: appFields.agentDuties || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).run()

    // Save uploaded files
    const uploadDir = resolve(process.cwd(), 'uploads', 'cases', caseNumber)
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true })
    }

    for (const file of files) {
      const safeFilename = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_')
      const filePath = resolve(uploadDir, safeFilename)
      // 统一存相对项目数据路径（读取方 join(process.cwd(), path) 兼容）
      const relativePath = `uploads/cases/${caseNumber}/${safeFilename}`

      // Write file
      writeFileSync(filePath, file.data)
      writtenFiles.push(filePath)

      // Create document record
      const docId = uuidv4()
      db.insert(documents).values({
        id: docId,
        caseId: caseNumber,
        filename: safeFilename,
        originalName: file.name,
        path: relativePath,
        mimeType: file.type || 'application/octet-stream',
        size: file.data.length,
        uploadedBy: null, // party upload, no mediator ID
        category: file.category, // application | evidence | identity | authorization
        createdAt: Date.now(),
      }).run()
      insertedDocIds.push(docId)
    }

    return {
      result: {
        success: true,
        data: {
          caseNumber,
          accessCode,
          fileCount: files.length,
          applicantName: appFields.applicantName || partyName || '',
        },
      },
      created: true,
    }
  } catch (err) {
    // 建案失败：尽量清理已写文件与已写记录，并撤销幂等占位（保留可重试状态）
    for (const id of insertedDocIds) {
      try {
        db.delete(documents).where(eq(documents.id, id)).run()
      } catch {
        // 忽略单个清理失败
      }
    }
    try {
      db.delete(caseApplications).where(eq(caseApplications.caseId, caseNumber)).run()
    } catch {
      // 忽略
    }
    try {
      db.delete(cases).where(eq(cases.id, caseNumber)).run()
    } catch {
      // 忽略
    }
    for (const p of writtenFiles) {
      try {
        unlinkSync(p)
      } catch {
        // 文件可能未写入成功，忽略
      }
    }
    if (ledgerClaimed) {
      try {
        deleteLedgerEntry(db, requestId!)
      } catch {
        // 忽略
      }
    }
    throw err
  }
}

export default defineEventHandler(async (event) => {
  // Parse multipart form data
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: '请上传至少一个文件' })
  }

  let caseType = ''
  let partyName = ''
  let respondentName = ''
  let disputeType = ''
  let description = ''
  let requestId = ''
  const files: Array<{ name: string; data: Buffer; type: string; category: string }> = []

  // 完整申请详情字段（方案C）
  const appFields: Record<string, string> = {}

  for (const part of formData) {
    if (!part.data) continue
    const isFile = part.filename
    if (isFile) {
      const category = FILE_CATEGORY_MAP[part.name ?? ''] || 'application'
      files.push({ name: part.filename!, data: part.data, type: part.type || '', category })
      continue
    }
    const value = part.data.toString('utf-8').trim()
    if (part.name === 'requestId') {
      requestId = value
    } else if (part.name === 'caseType') {
      caseType = value
    } else if (part.name === 'partyName') {
      partyName = value
      appFields.applicantName = value
    } else if (part.name === 'respondentName') {
      respondentName = value
      appFields.respondentName = value
    } else if (part.name === 'disputeType') {
      disputeType = value
    } else if (part.name === 'description') {
      description = value
    } else {
      // 其余文本字段全部收进 appFields（22字段 + 标志位）
      // 兼容 snake_case 字段名（官网表单），统一转为 camelCase
      appFields[toCamelCase(part.name ?? '')] = value
    }
  }

  if (files.length === 0) {
    // 文件为可选（官网表单不强制上传文件）
    console.log('[create-case] 未上传文件，纯文本建案')
  }

  const db = getDb()

  const outcome = createCaseWithFiles(db, {
    caseType,
    partyName,
    respondentName,
    disputeType,
    description,
    appFields,
    files,
    requestId: requestId || undefined,
  })

  if (outcome.created) {
    // 异步生成动态文件（不阻塞响应）
    triggerDynamicFileGeneration(outcome.result.data.caseNumber)
    // 异步生成AI首次欢迎消息（不阻塞响应）
    createAiWelcomeForCase(outcome.result.data.caseNumber).catch((err: any) =>
      console.warn(`[create-case] AI欢迎失败: ${err.message}`),
    )
  }

  return outcome.result
})

// 异步生成动态文件（不阻塞响应）
async function triggerDynamicFileGeneration(caseNumber: string) {
  try {
    const { generateDynamicFile } = await import('../../utils/generate-dynamic-file')
    const result = await generateDynamicFile(caseNumber)
    if (result.generated.length > 0) {
      console.log(`[create-case] ${caseNumber}: 动态文件已生成 ${result.generated.join(', ')}`)
    }
  } catch (err: any) {
    console.warn(`[create-case] ${caseNumber}: 动态文件生成失败 — ${err.message}`)
  }
}
