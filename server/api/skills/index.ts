// ============================================================
// GET /api/skills — 列出已安装的技能
// POST /api/skills — 上传技能 zip
// ============================================================
import { existsSync, mkdirSync, readdirSync, statSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../../middleware/auth'

const SKILLS_DIR = resolve(process.cwd(), 'uploads', 'skills')
const META_FILE = resolve(SKILLS_DIR, '.skills.json')

interface SkillMeta {
  id: string
  name: string
  version: string
  description: string
  dirName: string
  fileCount: number
  installedAt: string
  installedBy: string
  enabled: boolean
}

function loadMeta(): SkillMeta[] {
  if (!existsSync(META_FILE)) return []
  try { return JSON.parse(readFileSync(META_FILE, 'utf8')) } catch { return [] }
}
function saveMeta(list: SkillMeta[]) {
  if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true })
  writeFileSync(META_FILE, JSON.stringify(list, null, 2))
}

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)

  if (event.method === 'GET') {
    return { success: true, skills: loadMeta() }
  }

  if (event.method === 'POST') {
    if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true })
    const body = await readMultipartFormData(event)
    if (!body) throw createError({ statusCode: 400, message: '未收到文件' })

    const filePart = body.find(p => p.name === 'file')
    if (!filePart || !filePart.filename) throw createError({ statusCode: 400, message: '缺少文件' })
    if (!filePart.filename.toLowerCase().endsWith('.zip')) throw createError({ statusCode: 400, message: '只支持 .zip 文件' })

    // 安全校验：文件名只允许字母数字下划线中划线
    const safeBase = filePart.filename.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9_\-一-龥]/g, '_')
    const id = uuidv4()
    const dirName = `${safeBase}_${id.slice(0, 8)}`
    const skillDir = resolve(SKILLS_DIR, dirName)
    const zipPath = resolve(SKILLS_DIR, `${dirName}.zip`)

    try {
      writeFileSync(zipPath, filePart.data)
      // 用 unzip 解压；若系统无 unzip，回退到手动 zip 解压
      mkdirSync(skillDir, { recursive: true })
      try {
        execSync(`unzip -o -q "${zipPath}" -d "${skillDir}"`, { stdio: 'ignore' })
      } catch {
        // 简单 zip 解压回退
        const buf = filePart.data
        // 解析 zip 中央目录（支持简单情况）
        const entries = parseSimpleZip(buf)
        for (const e of entries) {
          const out = resolve(skillDir, e.name)
          if (e.isDir) { mkdirSync(out, { recursive: true }); continue }
          mkdirSync(resolve(out, '..'), { recursive: true })
          writeFileSync(out, e.data)
        }
      }
      // 尝试读取 manifest.json
      let manifest: any = {}
      const manifestPath = resolve(skillDir, 'manifest.json')
      if (existsSync(manifestPath)) {
        try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch {}
      }
      // 统计文件数
      let fileCount = 0
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          if (f.startsWith('.')) continue
          const p = resolve(d, f)
          const st = statSync(p)
          if (st.isDirectory()) walk(p)
          else fileCount++
        }
      }
      walk(skillDir)

      const meta: SkillMeta = {
        id,
        name: manifest.name || safeBase,
        version: manifest.version || '1.0.0',
        description: manifest.description || '',
        dirName,
        fileCount,
        installedAt: new Date().toISOString(),
        installedBy: mediator.username,
        enabled: true,
      }
      const list = loadMeta()
      list.push(meta)
      saveMeta(list)
      // 清理 zip 文件
      try { rmSync(zipPath) } catch {}
      return { success: true, skill: meta }
    } catch (err: any) {
      // 清理
      try { rmSync(skillDir, { recursive: true, force: true }) } catch {}
      try { rmSync(zipPath, { force: true }) } catch {}
      throw createError({ statusCode: 500, message: `安装失败：${err.message}` })
    }
  }
})

// 极简 zip 解压（仅 store/deflate，够用）
function parseSimpleZip(buf: Buffer): Array<{ name: string; isDir: boolean; data: Buffer }> {
  const entries: Array<{ name: string; isDir: boolean; data: Buffer }> = []
  let i = 0
  while (i < buf.length - 4) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break // PK\x03\x04
    const method = buf.readUInt16LE(i + 8)
    const compSize = buf.readUInt32LE(i + 18)
    const uncompSize = buf.readUInt32LE(i + 22)
    const nameLen = buf.readUInt16LE(i + 26)
    const extraLen = buf.readUInt16LE(i + 28)
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8')
    const dataStart = i + 30 + nameLen + extraLen
    const dataEnd = dataStart + compSize
    if (dataEnd > buf.length) break
    const compressed = buf.slice(dataStart, dataEnd)
    let data: Buffer
    if (method === 0) data = compressed
    else if (method === 8) {
      try { data = require('zlib').inflateRawSync(compressed) } catch { data = compressed }
    } else break
    entries.push({ name, isDir: name.endsWith('/'), data })
    i = dataEnd
  }
  return entries
}
