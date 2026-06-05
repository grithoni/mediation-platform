// ============================================================
// POST /api/cases/bind-mediator — 绑定调解员到案件
// ============================================================
import { getDb } from '../../database'
import { cases } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = getDb()
  const body = await readBody(event)
  const { caseId, mediatorId } = body

  if (!caseId || !mediatorId) {
    return { success: false, error: '缺少 caseId 或 mediatorId' }
  }

  const now = new Date()
  const nowUnix = Math.floor(Date.now() / 1000)

  db.update(cases)
    .set({
      mediatorId,
      mediatorBoundAt: nowUnix,
      phase: 'active',
      status: 'active',
      updatedAt: now,
    } as any)
    .where(eq(cases.id, caseId))
    .run()

  return { success: true, data: { caseId, mediatorId, boundAt: now } }
})
