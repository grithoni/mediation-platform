import { eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { caseDynamicFiles, cases } from '../../../database/schema'
import { requireMediator } from '../../../middleware/auth'
import { runMediationBackgroundAnalysis } from '../../../utils/mediation-agent'

export default defineEventHandler(async (event) => {
  requireMediator(event)

  const caseNumber = getRouterParam(event, 'caseNumber')
  if (!caseNumber) {
    throw createError({ statusCode: 400, message: '缺少案件编号' })
  }

  const db = getDb()
  const caseData = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  const now = Date.now()
  const existing = db
    .select()
    .from(caseDynamicFiles)
    .where(eq(caseDynamicFiles.caseId, caseNumber))
    .get()

  const patch = {
    agentStatus: 'processing' as const,
    agentUpdatedAt: now,
    updatedAt: now,
  }

  if (existing) {
    db.update(caseDynamicFiles)
      .set(patch)
      .where(eq(caseDynamicFiles.caseId, caseNumber))
      .run()
  } else {
    db.insert(caseDynamicFiles)
      .values({
        id: `cdf_${caseNumber}_${now}`,
        caseId: caseNumber,
        ...patch,
      })
      .run()
  }

  runMediationBackgroundAnalysis(caseNumber).catch((error) => {
    console.error(`[cases/${caseNumber}/agent-run] failed:`, error)
  })

  return {
    success: true,
    data: {
      caseId: caseNumber,
      agentStatus: 'processing',
      startedAt: now,
    },
  }
})
