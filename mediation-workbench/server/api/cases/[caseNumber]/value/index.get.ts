// ============================================================
// GET /api/cases/:caseNumber/value
// 返回该案件已完成的 VALUE 技能运行状态（目录见全局 /api/value）
// ============================================================
import { requireAuth } from '../../../../middleware/auth'
import { getValueStatus } from '../../../../utils/value-skills'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  if (!caseNumber) throw createError({ statusCode: 400, message: '缺少案件编号' })

  const status = getValueStatus(caseNumber)

  return {
    success: true,
    data: {
      caseId: caseNumber,
      status,
    },
  }
})
