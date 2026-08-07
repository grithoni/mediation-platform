import { getKbUrl } from '~/server/utils/service-urls'
import { requireMediator } from '~/server/middleware/auth'

export default defineEventHandler(async (event) => {
  requireMediator(event)
  const kbUrl = getKbUrl()
  const body = await readBody(event)

  try {
    const resp = await $fetch(`${kbUrl}/search`, {
      method: 'POST',
      body: { query: body.query, top_k: body.top_k || 5, mode: body.mode || 'rerank' },
      timeout: 15000,
    })
    return resp
  } catch (e: any) {
    if (e?.statusCode === 503 || e?.status === 503) {
      throw createError({ statusCode: 503, message: '知识库依赖未安装。请运行：pip install -r requirements.txt' })
    }
    throw createError({ statusCode: 500, message: `知识库搜索失败: ${e?.message || '未知错误'}` })
  }
})
