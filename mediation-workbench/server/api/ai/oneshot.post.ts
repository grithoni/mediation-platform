// ============================================================
// POST /api/ai/oneshot — 一次性非流式 AI 调用（用于话术/方案等）
// ============================================================
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { system, prompt, model, temperature } = body || {}

  if (!prompt) {
    throw createError({ statusCode: 400, message: '缺少 prompt 参数' })
  }

  const config = useRuntimeConfig()
  const apiKey = (config.openaiApiKey as string) || process.env.NUXT_OPENAI_API_KEY
  const baseURL = (config.openaiBaseUrl as string) || process.env.NUXT_OPENAI_BASE_URL
  const defaultModel = (config.openaiModel as string) || process.env.NUXT_OPENAI_MODEL || 'deepseek-v4-pro'

  if (!apiKey) {
    throw createError({ statusCode: 500, message: '未配置 AI 模型 API Key' })
  }

  try {
    const { generateText } = await import('ai')
    const { createOpenAI } = await import('@ai-sdk/openai')
    const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey }
    if (baseURL) openaiOptions.baseURL = baseURL
    const openai = createOpenAI(openaiOptions)

    const result = await generateText({
      model: openai(model || defaultModel),
      system: system || '你是一个商事调解专家。',
      prompt,
      temperature: typeof temperature === 'number' ? temperature : 0.4,
    })

    return {
      success: true,
      data: {
        content: result.text,
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
