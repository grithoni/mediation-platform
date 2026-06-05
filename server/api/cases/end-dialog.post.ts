// ============================================================
// POST /api/cases/end-dialog — 结束当事人对话，切换到调解员选择
// ============================================================
import { getDb } from '../../database'
import { cases, caseDynamicFiles } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = getDb()
  const body = await readBody(event)
  const { caseId } = body

  if (!caseId) {
    return { success: false, error: '缺少 caseId' }
  }

  const now = new Date()

  // Update case phase to mediator_selection
  db.update(cases)
    .set({
      phase: 'mediator_selection',
      updatedAt: now,
    } as any)
    .where(eq(cases.id, caseId))
    .run()

  // Mark dynamic file dialog as ended
  const existing = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseId)).get()
  if (existing) {
    db.update(caseDynamicFiles)
      .set({
        dialogEnded: true,
        updatedAt: now,
      } as any)
      .where(eq(caseDynamicFiles.caseId, caseId))
      .run()
  }

  return { success: true, data: { caseId, phase: 'mediator_selection' } }
})
