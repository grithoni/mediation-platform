// POST /api/cases/[caseNumber]/evaluation
// 当事人/调解员端：基于案件材料生成 6 部分《案情分析评估报告》并持久化
// 鉴权：登录用户 或 案件访问验证码（query.code）
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { caseAnalyses } from '../../../database/schema'
import { verifyPartyAccess } from '../../../utils/auth'
import { runStructuredWorkflowAnalysis } from '../../../utils/case-analysis-orchestrator'

export default defineEventHandler(async (event) => {
  const caseNumber = getRouterParam(event, 'caseNumber')!
  const user = event.context.user
  const code = getQuery(event).code as string | undefined

  if (!user) {
    if (!code) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    const { valid } = verifyPartyAccess(caseNumber, code)
    if (!valid) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  const report = await runStructuredWorkflowAnalysis(caseNumber, 'evaluation')

  const db = getDb()
  const existing = db
    .select()
    .from(caseAnalyses)
    .where(and(eq(caseAnalyses.caseId, caseNumber), eq(caseAnalyses.analysisType, 'evaluation')))
    .get()

  if (existing) {
    db.update(caseAnalyses)
      .set({ content: report, generatedAt: Date.now() })
      .where(eq(caseAnalyses.id, existing.id))
      .run()
  } else {
    db.insert(caseAnalyses)
      .values({
        id: `${caseNumber}-evaluation`,
        caseId: caseNumber,
        analysisType: 'evaluation',
        content: report,
        generatedAt: Date.now(),
      })
      .run()
  }

  return { success: true, data: { report, generatedAt: Date.now() } }
})