import { v4 as uuidv4 } from 'uuid'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases, documents } from '../../database/schema'
import { existsSync, mkdirSync, createWriteStream } from 'node:fs'
import { resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createReadStream } from 'node:fs'

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
  const files: Array<{ name: string; data: Buffer; type: string }> = []

  for (const part of formData) {
    if (part.name === 'caseType' && part.data) {
      caseType = part.data.toString('utf-8').trim()
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

  const caseNumber = `${currentYear}-${maxN + 1}`
  const accessCode = uuidv4().slice(0, 6)

  const caseTitle = caseTypeLabels[caseType] || '新建案件'

  // Create case in database
  db.insert(cases).values({
    id: caseNumber,
    title: caseTitle,
    description: `${caseTitle} — 当事人自行提交材料`,
    partyAName: '当事人',
    partyBName: '待确认',
    status: 'pending',
    accessCode,
    createdAt: new Date(),
    updatedAt: new Date(),
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
      createdAt: new Date(),
    }).run()
  }

  return {
    success: true,
    caseNumber,
    accessCode,
    fileCount: files.length,
  }
})
