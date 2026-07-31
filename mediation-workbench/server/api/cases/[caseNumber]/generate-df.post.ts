// ============================================================
// POST /api/cases/:caseNumber/generate-df — 为案件生成动态分析文件
// ============================================================
import { requireAuth } from '../../../middleware/auth'
import { generateDynamicFile } from '../../../utils/generate-dynamic-file'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const body = await readBody(event).catch(() => ({}))

  try {
    const result = await generateDynamicFile(caseNumber, { force: body?.force === true })

    let message = ''
    if (result.generated.length > 0) {
      message = `已生成 ${result.generated.length} 个分析维度：${result.generated.join('、')}`
    } else if (result.reason === 'already_complete') {
      message = '所有分析维度已有数据，无需重新生成'
    } else if (result.reason === 'insufficient_materials') {
      message = '案件材料不足，无法生成分析（需补充案件描述、主张答辩、证据质证等）'
    } else if (result.reason === 'ai_empty') {
      message = 'AI 分析未返回有效数据，请稍后重试'
    } else {
      message = '未生成任何分析维度'
    }

    return {
      success: true,
      data: {
        caseId: caseNumber,
        generated: result.generated,
        skipped: result.skipped,
        reason: result.reason,
        message,
      },
    }
  } catch (err: any) {
    throw createError({ statusCode: 500, message: '生成失败: ' + (err?.message || String(err)) })
  }
})
