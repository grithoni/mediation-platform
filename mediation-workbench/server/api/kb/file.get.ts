// ============================================================
// GET /api/kb/file?path=xxx.md
// 查看知识库中的 .md 文档原文（支持 .data/kb/docs/ 与 .data/kb/uploads/）
// 仅允许 .md 文件，其他格式不支持
// ============================================================
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
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
    // Allow absolute paths that are under the project root (common for engine-indexed files)
    const projectRoot = resolve(process.cwd())
    if (norm.startsWith(projectRoot + '/')) {
      resolvedPath = norm
    } else {
      // Fallback to allowed KB roots for backward compatibility
      for (const root of allowedRoots) {
        const rel = relative(root, norm)
        if (!rel.startsWith('..') && !rel.startsWith('/')) {
          resolvedPath = norm
          break
        }
      }
    }
  } else {
    // Try resolving under allowed KB roots first (normal case)
    for (const root of allowedRoots) {
      const candidate = resolve(root, filePath)
      const rel = relative(root, candidate)
      if (!rel.startsWith('..') && !rel.startsWith('/')) {
        resolvedPath = candidate
        break
      }
    }
    // Some clients send a rel_path like "../../.data/kb/..." — resolve that
    // relative to the project root and allow it if it lives under the project.
    if (!resolvedPath) {
      const projectRoot = resolve(process.cwd())
      const candidate = resolve(projectRoot, filePath)
      const rel = relative(projectRoot, candidate)
      if (!rel.startsWith('..') && !rel.startsWith('/')) {
        resolvedPath = candidate
      } else {
        // Fallback: search allowedRoots for a file with the same basename.
        const basename = filePath.split('/').pop() || filePath
        for (const root of allowedRoots) {
          try {
            const walk = (dir: string): string | null => {
              const entries = readdirSync(dir)
              for (const e of entries) {
                const p = resolve(dir, e)
                try {
                  const s = statSync(p)
                  if (s.isDirectory()) {
                    const found = walk(p)
                    if (found) return found
                  } else if (e === basename) {
                    return p
                  }
                } catch (err) {
                  // ignore
                }
              }
              return null
            }
            const found = walk(root)
            if (found) {
              resolvedPath = found
              break
            }
          } catch (err) {
            // ignore
          }
        }
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
