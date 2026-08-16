// ============================================================
// POST /api/cases/:caseNumber/value/run-all
// 自动编排：按 V→A→L→U→E 阶段及阶段内预设顺序依次运行全部技能。
// 依赖校验：目标技能依赖未完成时自动补跑；执行失败记录但不中断整链。
// 已完成技能默认跳过（人工先单点过的技能将被跳过，缺口自动补齐）。
// 查询参数：
//   ?force=1         强制重跑全部（跳过已完成检查）
//   ?phaseByPhase=1  阶段暂停模式：每阶段出口技能后暂停，返回 pauseAtPhase 等待人工确认
//   ?fromPhase=V     从指定阶段恢复运行（与暂停状态衔接）
// ============================================================
import { requireAuth } from '../../../../middleware/auth'
import { runValuePipelineAuto } from '../../../../utils/value-skills'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const q = getQuery(event)
  const force = q.force === '1'
  const phaseByPhase = q.phaseByPhase === '1'
  const fromPhase = (q.fromPhase as string | undefined)?.toUpperCase()

  if (!caseNumber) throw createError({ statusCode: 400, message: '缺少案件编号' })

  try {
    const result = await runValuePipelineAuto(caseNumber, { force, fromPhase, phaseByPhase })
    return { success: true, data: result }
  } catch (err: any) {
    console.error(`[value] run-all failed for ${caseNumber}:`, err)
    throw createError({
      statusCode: 500,
      message: err?.message || '自动编排失败，请稍后重试',
    })
  }
})
