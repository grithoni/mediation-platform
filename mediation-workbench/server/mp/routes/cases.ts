import type { Router } from 'h3'
import { defineEventHandler, createError } from 'h3'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases, caseDynamicFiles, documents } from '../../database/schema'

/**
 * GET /api/mp/cases           — List cases
 * GET /api/mp/cases/:id       — Case detail
 * GET /api/mp/cases/:id/files — Case files
 */
export function caseRoutes(router: Router) {
  router.get('/api/mp/cases', defineEventHandler(async (event) => {
    const user = (event as any).context.mpUser
    const db = getDb()
    const allCases = db.select().from(cases).orderBy(desc(cases.createdAt)).all()
    const userCases = allCases.filter(c => {
      if (user.openid.startsWith('demo_')) return user.openid === `demo_${c.id}`
      return true
    })
    return {
      success: true,
      data: userCases.map(c => ({
        id: c.id, title: c.title, description: c.description,
        partyAName: c.partyAName, partyBName: c.partyBName,
        phase: c.phase, status: c.status, createdAt: c.createdAt,
      })),
    }
  }))

  router.get('/api/mp/cases/:id', defineEventHandler(async (event) => {
    const id = (event as any).context.params?.id
    if (!id) throw createError({ statusCode: 400, message: '缺少案件编号' })
    const caseRow = db.select().from(cases).where(eq(cases.id, id)).get()
    if (!caseRow) throw createError({ statusCode: 404, message: '案件不存在' })
    const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, id)).get()
    return { success: true, data: { ...caseRow, dynamicFiles: df || null } }
  }))

  router.get('/api/mp/cases/:id/files', defineEventHandler(async (event) => {
    const id = (event as any).context.params?.id
    if (!id) throw createError({ statusCode: 400, message: '缺少案件编号' })
    const files = db.select().from(documents).where(eq(documents.caseId, id)).all()
    return {
      success: true,
      data: files.map(f => ({ id: f.id, filename: f.originalName, size: f.size, mimeType: f.mimeType, createdAt: f.createdAt })),
    }
  }))
}
