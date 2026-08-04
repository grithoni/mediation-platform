import { getKbUrl } from '~/server/utils/service-urls'

export default defineEventHandler(async (event) => {
  const kbUrl = getKbUrl()

  try {
    const body = await readBody(event)
    const resp = await $fetch(`${kbUrl}/preview`, {
      method: 'POST',
      body,
      timeout: 30000,
    })
    return resp
  } catch (e: any) {
    if (e?.statusCode === 503 || e?.status === 503) {
      throw createError({ statusCode: 503, message: '知识库依赖未安装。请运行：pip install -r requirements.txt' })
    }
    throw createError({ statusCode: 500, message: `分段预览失败: ${e?.message || '未知错误'}` })
  }
})
