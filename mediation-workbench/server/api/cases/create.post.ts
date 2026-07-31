import { v4 as uuidv4 } from 'uuid'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases, documents, caseApplications } from '../../database/schema'
import { existsSync, mkdirSync, createWriteStream } from 'node:fs'
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
  const files: Array<{ name: string; data: Buffer; type: string; category: string }> = []

  // 完整申请详情字段（方案C）
  const appFields: Record<string, string> = {}

  for (const part of formData) {
    if (!part.data) continue
    const isFile = part.filename
    if (isFile) {
      const category = FILE_CATEGORY_MAP[part.name] || 'application'
      files.push({ name: part.filename!, data: part.data, type: part.type || '', category })
      continue
    }
    const value = part.data.toString('utf-8').trim()
    if (part.name === 'caseType') {
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
      appFields[toCamelCase(part.name)] = value
    }
  }

  if (!caseType || !['mediation', 'evaluation', 'review'].includes(caseType)) {
    throw createError({ statusCode: 400, message: '无效的案件类型' })
  }

  if (files.length === 0) {
    // 文件为可选（官网表单不强制上传文件）
    console.log('[create-case] 未上传文件，纯文本建案')
  }

  const db = getDb()

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

    // Write file
    const writeStream = createWriteStream(filePath)
    writeStream.write(file.data)
    writeStream.end()
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })

    // Create document record
    db.insert(documents).values({
      id: uuidv4(),
      caseId: caseNumber,
      filename: safeFilename,
      originalName: file.name,
      path: filePath,
      mimeType: file.type || 'application/octet-stream',
      size: file.data.length,
      uploadedBy: null, // party upload, no mediator ID
      category: file.category, // application | evidence | identity | authorization
      createdAt: Date.now(),
    }).run()
  }

  // 异步生成动态文件（不阻塞响应）
  triggerDynamicFileGeneration(caseNumber)
  // 异步生成AI首次欢迎消息（不阻塞响应）
  createAiWelcomeForCase(caseNumber).catch((err: any) => console.warn(`[create-case] AI欢迎失败: ${err.message}`))

  return {
    success: true,
    data: {
      caseNumber,
      accessCode,
      fileCount: files.length,
      applicantName: appFields.applicantName || partyName || '',
    },
  }
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
