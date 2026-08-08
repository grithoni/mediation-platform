export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const model = config.openaiModel || 'deepseek-v4-flash'
  const hasApiKey = !!config.openaiApiKey

  return {
    success: true,
    service: 'ai-engine',
    provider: hasApiKey ? 'DeepSeek/OpenAI-compatible' : 'mock',
    model,
    status: hasApiKey ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
  }
})
