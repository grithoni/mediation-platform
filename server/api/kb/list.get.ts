export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const kbUrl = process.env.KB_URL || 'http://localhost:8700'
  const query = getQuery(event)

  try {
    const resp = await $fetch(`${kbUrl}/list`, {
      params: { limit: query.limit || 1000 },
      timeout: 10000,
    })
    return resp
  } catch (e: any) {
    if (e?.statusCode === 503 || e?.status === 503) {
      throw createError({ statusCode: 503, message: '知识库依赖未安装。请运行：pip install -r requirements.txt' })
    }
    throw createError({ statusCode: 500, message: `知识库请求失败: ${e?.message || '未知错误'}` })
  }
})
