// ============================================================
// GET /api/cases/:caseNumber/analysis-status
// 返回 4 个分析任务的完成状态
// ============================================================
import { getAnalysisStatus } from '../../../utils/analysis-cache'
import { requireAuth } from '../../../middleware/auth'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  if (!caseNumber) throw createError({ statusCode: 400, message: '缺少案件编号' })

  const status = getAnalysisStatus(caseNumber)
  return { success: true, data: status }
})
