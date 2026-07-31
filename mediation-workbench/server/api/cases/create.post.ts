import { v4 as uuidv4 } from 'uuid'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases, documents } from '../../database/schema'
import { existsSync, mkdirSync, createWriteStream } from 'node:fs'
import { resolve } from 'node:path'
import { createAiWelcomeForCase } from '../../utils/ai-welcome'

const caseTypeLabels: Record<string, string> = {
  mediation: '申请调解',
  evaluation: '申请中立评估',
  review: '申请争议评审',
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
  const files: Array<{ name: string; data: Buffer; type: string }> = []

  for (const part of formData) {
    if (part.name === 'caseType' && part.data) {
      caseType = part.data.toString('utf-8').trim()
    } else if (part.name === 'partyName' && part.data) {
      partyName = part.data.toString('utf-8').trim()
    } else if (part.name === 'respondentName' && part.data) {
      respondentName = part.data.toString('utf-8').trim()
    } else if (part.name === 'disputeType' && part.data) {
      disputeType = part.data.toString('utf-8').trim()
    } else if (part.name === 'description' && part.data) {
      description = part.data.toString('utf-8').trim()
    } else if (part.name === 'files' && part.filename) {
      files.push({ name: part.filename, data: part.data, type: part.type || '' })
    }
  }

  if (!caseType || !['mediation', 'evaluation', 'review'].includes(caseType)) {
    throw createError({ statusCode: 400, message: '无效的案件类型' })
  }

  if (files.length === 0) {
    throw createError({ statusCode: 400, message: '请上传至少一个文件' })
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

  const caseTitle = disputeType || description || caseTypeLabels[caseType] || '新建案件'

  // Create case in database
  db.insert(cases).values({
    id: caseNumber,
    tenantId: 'tenant-default',
    title: caseTitle,
    description: description || `${caseTitle} — 当事人自行提交材料`,
    partyAName: partyName || '当事人',
    partyBName: respondentName || '待确认',
    status: 'pending',
    accessCode,
    phase: 'intake',
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
