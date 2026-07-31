import { eq } from 'drizzle-orm'
import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { getDb } from '../../database'
import { documents } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, 'id')
  if (!docId) {
    throw createError({ statusCode: 400, message: '缺少文件ID' })
  }

  const db = getDb()
  const doc = db.select().from(documents).where(eq(documents.id, docId)).get()

  if (!doc) {
    throw createError({ statusCode: 404, message: '文件不存在' })
  }

  const filePath = join(process.cwd(), doc.path)
  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: '文件已被删除或移动' })
  }

  // Set response headers
  setResponseHeader(event, 'Content-Type', doc.mimeType || 'application/octet-stream')
  setResponseHeader(event, 'Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`)
  if (doc.size) {
    setResponseHeader(event, 'Content-Length', String(doc.size))
  }

  return readFileSync(filePath)
})
