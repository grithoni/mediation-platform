// ============================================================
// POST /api/cases/:caseNumber/value/:skillId
// 运行单个 VALUE 技能 — 缓存优先，?force=1 强制重新生成
// ============================================================
import { requireAuth } from '../../../../middleware/auth'
import { getCachedValue, getValueSkill, runValueSkill } from '../../../../utils/value-skills'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const skillId = getRouterParam(event, 'skillId') as string
  const force = getQuery(event).force === '1'

  if (!caseNumber || !skillId) throw createError({ statusCode: 400, message: '缺少参数' })
  if (!getValueSkill(skillId)) throw createError({ statusCode: 404, message: `未知技能: ${skillId}` })

  if (!force) {
    const cached = getCachedValue(caseNumber, skillId)
    if (cached) {
      return { success: true, data: { skillId, content: cached, cached: true } }
    }
  }

  try {
    const content = await runValueSkill(caseNumber, skillId)
    return { success: true, data: { skillId, content, cached: false } }
  } catch (err: any) {
    console.error(`[value] run failed for ${caseNumber}/${skillId}:`, err)
    throw createError({
      statusCode: 500,
      message: err?.message || '技能运行失败，请稍后重试',
    })
  }
})
