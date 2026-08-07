// ============================================================
// POST /api/cases/:caseNumber/solve/:skillId
// 运行单个 SOLVE 技能 — 缓存优先，?force=1 强制重新生成
// ============================================================
import { requireAuth } from '../../../../middleware/auth'
import { getSolveSkill, getCachedSolve, runSolveSkill } from '../../../../utils/solve-skills'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const skillId = getRouterParam(event, 'skillId') as string
  const force = getQuery(event).force === '1'

  if (!caseNumber || !skillId) throw createError({ statusCode: 400, message: '缺少参数' })
  if (!getSolveSkill(skillId)) throw createError({ statusCode: 404, message: `未知技能: ${skillId}` })

  if (!force) {
    const cached = getCachedSolve(caseNumber, skillId)
    if (cached) {
      return { success: true, data: { skillId, content: cached, cached: true } }
    }
  }

  try {
    const content = await runSolveSkill(caseNumber, skillId)
    return { success: true, data: { skillId, content, cached: false } }
  } catch (err: any) {
    console.error(`[solve] run failed for ${caseNumber}/${skillId}:`, err)
    throw createError({
      statusCode: 500,
      message: err?.message || '技能运行失败，请稍后重试',
    })
  }
})