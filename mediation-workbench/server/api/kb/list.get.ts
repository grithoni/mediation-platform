import { getKbUrl } from '~/server/utils/service-urls'
import { requireMediator } from '~/server/middleware/auth'

export default defineEventHandler(async (event) => {
  requireMediator(event)
  const config = useRuntimeConfig()
  const kbUrl = getKbUrl()
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
    // 连接失败（ECONNREFUSED / fetch failed）→ 服务未启动
    const isConnRefused = /ECONNREFUSED|fetch failed|connect/i.test(e?.message || '')
    if (isConnRefused) {
      throw createError({
        statusCode: 503,
        message: '知识库服务未启动。请运行：npm run dev:all（或 npm run kb）',
      })
    }
    throw createError({ statusCode: 500, message: `知识库请求失败: ${e?.message || '未知错误'}` })
  }
})
