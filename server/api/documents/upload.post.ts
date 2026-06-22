import { v4 as uuidv4 } from 'uuid'
import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { getDb } from '../../database'
import { documents } from '../../database/schema'
import { requireAuth } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: '未上传文件' })
  }

  // Extract fields from form data
  let caseId: string | null = null
  let fileField: { data: Buffer; filename: string; type: string } | null = null

  for (const field of formData) {
    if (field.name === 'caseId') {
      caseId = field.data.toString()
    } else if (field.name === 'file' && field.filename) {
      fileField = { data: field.data, filename: field.filename, type: field.type || 'application/octet-stream' }
    }
  }

  if (!caseId) {
    throw createError({ statusCode: 400, message: '缺少 caseId' })
  }
  if (!fileField) {
    throw createError({ statusCode: 400, message: '缺少文件' })
  }

  const db = getDb()

  // Save file to ./uploads/{caseId}/{uuid}-{originalName}
  const docId = uuidv4()
  const safeName = `${docId}-${fileField.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const uploadDir = join(process.cwd(), 'uploads', caseId)

  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true })
  }

  const filePath = join(uploadDir, safeName)
  writeFileSync(filePath, fileField.data)

  // Insert document record
  const docRecord = {
    id: docId,
    caseId,
    filename: safeName,
    originalName: fileField.filename,
    path: `uploads/${caseId}/${safeName}`,
    mimeType: fileField.type,
    size: fileField.data.length,
    uploadedBy: mediator.id,
    createdAt: Date.now(),
  }

  db.insert(documents).values(docRecord).run()

  return { success: true, data: docRecord }
})
