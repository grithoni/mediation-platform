// GET /api/cases/[caseNumber]/evaluation
// 当事人/调解员端：读取该案件的智能评估报告（6 部分《案情分析评估报告》）
// 鉴权：登录用户 或 案件访问验证码（query.code）
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { caseAnalyses } from '../../../database/schema'
import { verifyPartyAccess } from '../../../utils/auth'

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

  const db = getDb()
  const row = db
    .select()
    .from(caseAnalyses)
    .where(and(eq(caseAnalyses.caseId, caseNumber), eq(caseAnalyses.analysisType, 'evaluation')))
    .get()

  if (!row) {
    return { success: true, data: { report: '', generatedAt: null, status: 'none' } }
  }

  return {
    success: true,
    data: { report: row.content || '', generatedAt: row.generatedAt, status: 'done' },
  }
})