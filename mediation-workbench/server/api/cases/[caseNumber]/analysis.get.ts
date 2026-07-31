// GET /api/cases/[caseNumber]/analysis
// 当事人端轮询：返回该案件的专家分析状态与结果
// 鉴权：案件访问验证码（query.code）或 sessionToken
import { eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { caseDynamicFiles } from '../../../database/schema'
import { verifyPartyAccess } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const caseNumber = getRouterParam(event, 'caseNumber')!
  const code = getQuery(event).code as string | undefined

  // 当事人访问校验
  if (code) {
    const { valid } = verifyPartyAccess(caseNumber, code)
    if (!valid) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  const db = getDb()
  const row = db
    .select()
    .from(caseDynamicFiles)
    .where(eq(caseDynamicFiles.caseId, caseNumber))
    .get()

  if (!row) {
    return { success: true, data: { agentStatus: 'pending', agentAnalysis: '', materialChecklist: '' } }
  }

  return {
    success: true,
    data: {
      agentStatus: row.agentStatus,
      agentAnalysis: row.agentAnalysis || '',
      materialChecklist: row.materialChecklist || '',
      agentUpdatedAt: row.agentUpdatedAt,
    },
  }
})
