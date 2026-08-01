// ============================================================
// GET /api/kb/file?path=xxx.md
// 查看知识库中的 .md 文档原文（支持 .data/kb/docs/ 与 .data/kb/uploads/）
// 仅允许 .md 文件，其他格式不支持
// ============================================================
import { readFileSync, existsSync } from 'fs'
import { resolve, relative, normalize, isAbsolute } from 'path'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const filePath = query.path as string

  if (!filePath) {
    throw createError({ statusCode: 400, message: '缺少 path 参数' })
  }

  // 知识库两个根目录：内置文档 + 用户上传
  const kbRoot = resolve(process.cwd(), '.data', 'kb')
  const allowedRoots = [resolve(kbRoot, 'docs'), resolve(kbRoot, 'uploads')]

  // 解析目标路径：绝对路径直接用，相对路径按两个根目录解析
  let resolvedPath: string | null = null
  if (isAbsolute(filePath)) {
    const norm = normalize(filePath)
    for (const root of allowedRoots) {
      const rel = relative(root, norm)
      if (!rel.startsWith('..') && !rel.startsWith('/')) {
        resolvedPath = norm
        break
      }
    }
  } else {
    for (const root of allowedRoots) {
      const candidate = resolve(root, filePath)
      const rel = relative(root, candidate)
      if (!rel.startsWith('..') && !rel.startsWith('/')) {
        resolvedPath = candidate
        break
      }
    }
  }

  if (!resolvedPath) {
    throw createError({ statusCode: 403, message: '路径不允许' })
  }

  // 检查文件是否存在
  if (!existsSync(resolvedPath)) {
    throw createError({ statusCode: 404, message: '文件不存在' })
  }

  // 只允许查看 .md 文件
  if (!resolvedPath.toLowerCase().endsWith('.md')) {
    throw createError({ statusCode: 403, message: '仅支持查看 .md 文件' })
  }

  const content = readFileSync(resolvedPath, 'utf-8')

  setResponseHeaders(event, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'no-cache',
  })

  return content
})
