// ============================================================
// GET /api/cases/:caseNumber/value/pipeline-status
// 读取自动编排状态（阶段暂停/恢复用）：返回当前阶段、已完成技能、失败列表
// ============================================================
import { requireAuth } from '../../../../middleware/auth'
import { getPipelineStatus } from '../../../../utils/value-skills'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const status = getPipelineStatus(caseNumber)
  return { success: true, data: status }
})
