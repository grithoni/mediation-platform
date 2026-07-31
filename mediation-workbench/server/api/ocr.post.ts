/**
 * OCR 代理端点 — 转发到独立 OCR 微服务 (http://localhost:8701/api/ocr)
 * 供前端申请页自动回填使用。
 */
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
  const blob = new Blob([filePart.data], {
    type: (filePart.type as string) || 'application/octet-stream',
  })
  body.append('file', blob, filePart.filename as string)

  try {
    const resp = await fetch('http://localhost:8701/api/ocr', {
      method: 'POST',
      body,
    })
    const json = await resp.json()
    if (!resp.ok) {
      throw createError({ statusCode: resp.status, message: json.error || 'OCR 服务错误' })
    }
    return json
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 502, message: `OCR 服务不可用: ${err.message}` })
  }
})
