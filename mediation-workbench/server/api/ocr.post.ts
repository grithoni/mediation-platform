import { getOcrUrl } from '~/server/utils/service-urls'

/**
 * OCR 代理端点 — 转发到独立 OCR 微服务
 * 地址由环境变量 OCR_URL / runtimeConfig.ocrUrl 覆盖，默认 http://localhost:8701。
 * 供前端申请页自动回填使用。
 */
const OCR_TIMEOUT_MS = 120_000 // OCR 含 DeepSeek 字段抽取，给足时间但仍兜底

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: '请上传文件' })
  }

  const filePart = formData.find((p) => p.name === 'file' && p.filename)
  if (!filePart) {
    throw createError({ statusCode: 400, message: '缺少文件字段' })
  }

  // 构建转发 FormData
  const body = new FormData()
  const blob = new Blob([new Uint8Array(filePart.data)], {
    type: (filePart.type as string) || 'application/octet-stream',
  })
  body.append('file', blob, filePart.filename as string)

  const ocrUrl = `${getOcrUrl()}/api/ocr`

  try {
    const resp = await fetch(ocrUrl, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(OCR_TIMEOUT_MS),
    })
    const json = await resp.json()
    if (!resp.ok) {
      throw createError({ statusCode: resp.status, message: json.error || 'OCR 服务错误' })
    }
    return json
  } catch (err: any) {
    if (err.statusCode) throw err
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw createError({ statusCode: 504, message: 'OCR 服务响应超时，请稍后重试' })
    }
    throw createError({ statusCode: 502, message: `OCR 服务不可用: ${err.message}` })
  }
})
