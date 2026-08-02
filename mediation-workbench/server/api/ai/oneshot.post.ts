// ============================================================
// POST /api/ai/oneshot — 一次性非流式 AI 调用（用于话术/方案等）
// ============================================================
import { nanobotChat } from '../../utils/nanobot'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { system, prompt, temperature } = body || {}

  if (!prompt) {
    throw createError({ statusCode: 400, message: '缺少 prompt 参数' })
  }

  try {
    const content = await nanobotChat({
      system: system || '你是一个商事调解专家。',
      prompt,
      temperature: typeof temperature === 'number' ? temperature : 0.4,
    })

    return {
      success: true,
      data: {
        content,
        generatedAt: new Date().toISOString(),
      },
    }
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      message: 'AI 调用失败: ' + (err?.message || String(err)),
    })
  }
})
