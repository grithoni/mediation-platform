// ============================================================
// GET /api/cases/:caseNumber/solve
// SOLVE 调解智能体 — 返回 5 阶段 × 25 技能目录 + 该案件已完成状态
// ============================================================
import { requireAuth } from '../../../../middleware/auth'
import { SOLVE_PHASES, SOLVE_SKILLS, getSolveStatus } from '../../../../utils/solve-skills'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  if (!caseNumber) throw createError({ statusCode: 400, message: '缺少案件编号' })

  const status = getSolveStatus(caseNumber)

  return {
    success: true,
    data: {
      caseId: caseNumber,
      phases: SOLVE_PHASES,
      skills: SOLVE_SKILLS,
      status,
    },
  }
})