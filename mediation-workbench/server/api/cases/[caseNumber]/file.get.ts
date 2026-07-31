// ============================================================
// GET /api/cases/:caseNumber/file?name=xxx — 读取/下载案件原始文件
// ============================================================
import { existsSync, statSync, realpathSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { requireAuth } from '../../../middleware/auth'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const name = getQuery(event).name as string

  if (!name || name.includes('/') || name.includes('..') || name.includes('\\')) {
    throw createError({ statusCode: 400, message: '非法文件名' })
  }

  const uploadsBase = resolve(process.cwd(), 'uploads', 'cases')
  const candidates = [
    resolve(uploadsBase, caseNumber),
    resolve(uploadsBase, `case1_加盟连锁`),
    resolve(uploadsBase, `case2_情感咨询`),
    resolve(uploadsBase, `case3_教育培训`),
    resolve(uploadsBase, `case4_法律代理`),
    resolve(uploadsBase, `case5_营销策划`),
    resolve(uploadsBase, `case6_材料加工`),
    resolve(uploadsBase, `case7_设备采购`),
    resolve(uploadsBase, `case8_合同纠纷`),
  ]

  let dir: string | null = null
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const rp = realpathSync(c)
        if (statSync(rp).isDirectory()) { dir = rp; break }
      } catch {}
    }
  }
  if (!dir) throw createError({ statusCode: 404, message: '案件目录不存在' })

  const filePath = resolve(dir, name)
  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, message: '文件不存在' })
  }

  // 路径安全校验：filePath 必须以 dir 开头
  const dirReal = realpathSync(dir)
  const fileReal = realpathSync(filePath)
  if (!fileReal.startsWith(dirReal)) {
    throw createError({ statusCode: 403, message: '禁止访问' })
  }

  const ext = name.toLowerCase().split('.').pop() || ''
  const mimeMap: Record<string, string> = {
    txt: 'text/plain', md: 'text/markdown', json: 'application/json',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp',
  }
  const mime = mimeMap[ext] || 'application/octet-stream'
  setHeader(event, 'Content-Type', `${mime}; charset=utf-8`)
  setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`)
  return readFileSync(fileReal)
})
