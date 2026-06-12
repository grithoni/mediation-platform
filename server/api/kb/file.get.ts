// ============================================================
// GET /api/kb/file?path=参考案例/民间借贷/xxx.md
// 下载知识库中的文件（仅限 .data/kb/docs/ 目录下）
// ============================================================
import { createReadStream, existsSync } from 'fs'
import { resolve, relative, normalize } from 'path'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const filePath = query.path as string

  if (!filePath) {
    throw createError({ statusCode: 400, message: '缺少 path 参数' })
  }

  // 安全检查：防止路径穿越
  const kbDocsDir = resolve(process.cwd(), '.data', 'kb', 'docs')
  const resolvedPath = resolve(kbDocsDir, filePath)
  const relPath = relative(kbDocsDir, resolvedPath)

  if (relPath.startsWith('..') || relPath.startsWith('/')) {
    throw createError({ statusCode: 403, message: '路径不允许' })
  }

  // 检查文件是否存在
  if (!existsSync(resolvedPath)) {
    throw createError({ statusCode: 404, message: '文件不存在' })
  }

  // 只允许下载 .md 文件
  if (!resolvedPath.endsWith('.md')) {
    throw createError({ statusCode: 403, message: '仅支持下载 .md 文件' })
  }

  const fileName = filePath.split('/').pop() || 'document.md'

  setResponseHeaders(event, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    'Cache-Control': 'no-cache',
  })

  return sendStream(event, createReadStream(resolvedPath))
})
