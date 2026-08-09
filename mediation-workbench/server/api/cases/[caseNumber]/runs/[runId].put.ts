import { eq } from 'drizzle-orm'
import { getDb } from '~/server/database'
import { caseTaskRuns } from '~/server/database/schema'
import { requireMediator } from '~/server/middleware/auth'

// ============================================================
// 人工复核代理执行记录
// 调解员核实幻觉/低分项后，将 review_state 从 rejected 改为 approved
// ============================================================
export default defineEventHandler(async (event) => {
  requireMediator(event)
  const caseId = getRouterParam(event, 'caseNumber')
  const runId = getRouterParam(event, 'runId')

  if (!caseId || !runId) {
    throw createError({ statusCode: 400, message: '缺少案件ID或执行记录ID' })
  }

  const db = getDb()
  const run = db.select().from(caseTaskRuns).where(eq(caseTaskRuns.id, runId)).get()
  if (!run || run.caseId !== caseId) {
    throw createError({ statusCode: 404, message: '执行记录不存在' })
  }

  db.update(caseTaskRuns).set({
    reviewState: 'approved',
  }).where(eq(caseTaskRuns.id, runId)).run()

  return { success: true, data: { runId, reviewState: 'approved' } }
})
