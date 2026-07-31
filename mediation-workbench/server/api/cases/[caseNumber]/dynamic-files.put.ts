// ============================================================
// PUT /api/cases/:caseNumber/dynamic-files — 更新案件动态分析文件
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { caseDynamicFiles } from '../../../database/schema'
import { requireAuth } from '../../../middleware/auth'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const body = await readBody(event)
  const db = getDb()

  const allowedFields = ['partyAnalysis', 'timeline', 'disputeChecklist', 'positions', 'potentialInterests', 'batna'] as const
  const updates: Record<string, string> = {}
  for (const f of allowedFields) {
    if (body[f] !== undefined && body[f] !== null) {
      updates[f] = String(body[f])
    }
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, message: '没有需要更新的字段' })
  }

  const now = new Date()
  const existing = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseNumber)).get()

  if (existing) {
    db.update(caseDynamicFiles).set({ ...updates, updatedAt: now }).where(eq(caseDynamicFiles.caseId, caseNumber)).run()
  } else {
    db.insert(caseDynamicFiles).values({
      id: caseNumber,
      caseId: caseNumber,
      ...updates,
      createdAt: now,
      updatedAt: now,
      dialogEnded: false,
      dialogTurnCount: 0,
    }).run()
  }

  return { success: true, updatedFields: Object.keys(updates) }
})
