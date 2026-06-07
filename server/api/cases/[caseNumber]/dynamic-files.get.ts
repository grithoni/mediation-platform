// ============================================================
// GET /api/cases/:caseNumber/dynamic-files — 读取案件动态分析文件
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { caseDynamicFiles } from '../../../database/schema'
import { requireAuth } from '../../../middleware/auth'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const db = getDb()

  const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseNumber)).get()

  if (!df) {
    return { success: true, data: null }
  }

  return {
    success: true,
    data: {
      partyAnalysis: df.partyAnalysis,
      timeline: df.timeline,
      disputeChecklist: df.disputeChecklist,
      positions: df.positions,
      potentialInterests: df.potentialInterests,
      batna: df.batna,
      dialogTurnCount: df.dialogTurnCount,
      dialogEnded: df.dialogEnded,
      updatedAt: df.updatedAt,
    },
  }
})
