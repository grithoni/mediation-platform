// ============================================================
// GET /api/solve — SOLVE 调解技能库全球目录（5 阶段 × 25 技能）
// 供 mediator/agents 等无案件上下文页面浏览/跳转使用。
// ============================================================
import { requireAuth } from '../../middleware/auth'
import { SOLVE_PHASES, SOLVE_SKILLS } from '../../utils/solve-skills'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  return {
    success: true,
    data: {
      phases: SOLVE_PHASES,
      skills: SOLVE_SKILLS,
    },
  }
})