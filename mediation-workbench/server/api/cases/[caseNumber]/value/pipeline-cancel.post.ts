// ============================================================
// POST /api/cases/:caseNumber/value/pipeline-cancel
// 取消自动编排：标记 cancelled，下次自动分析重新开始但跳过已完成技能
// ============================================================
import { requireAuth } from '../../../../middleware/auth'
import { cancelValuePipeline } from '../../../../utils/value-skills'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  cancelValuePipeline(caseNumber)
  return { success: true, data: { status: 'cancelled' } }
})
