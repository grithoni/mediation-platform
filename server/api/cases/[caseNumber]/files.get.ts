// ============================================================
// GET /api/cases/:caseNumber/files — 列出案件原始文件
// ============================================================
import { existsSync, readdirSync, statSync, realpathSync } from 'fs'
import { resolve } from 'path'
import { requireAuth } from '../../../middleware/auth'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string

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

  if (!dir) return { success: true, files: [] }

  const mimeMap: Record<string, string> = {
    txt: 'text/plain', md: 'text/markdown', json: 'application/json',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp',
  }

  const names = readdirSync(dir).filter(n => !n.startsWith('.'))
  const files = names.map(name => {
    const full = resolve(dir!, name)
    let size = 0
    try { size = statSync(full).size } catch {}
    const ext = name.toLowerCase().split('.').pop() || ''
    return { name, size, mime: mimeMap[ext] || 'application/octet-stream', ext }
  })

  return { success: true, files, dir: dir.split('/').pop() }
})
