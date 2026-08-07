// ============================================================
// GET /api/cases/:caseNumber/solve
// 返回该案件已完成的 VALUE 技能运行状态（目录见全局 /api/solve）
// ============================================================
import { requireAuth } from '../../../../middleware/auth'
import { getSolveStatus } from '../../../../utils/solve-skills'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  if (!caseNumber) throw createError({ statusCode: 400, message: '缺少案件编号' })

  const status = getSolveStatus(caseNumber)

  return {
    success: true,
    data: {
      caseId: caseNumber,
      status,
    },
  }
})