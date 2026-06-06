// ============================================================
// DELETE /api/skills/:id — 卸载技能
// ============================================================
import { existsSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { requireAuth } from '../../../middleware/auth'

const SKILLS_DIR = resolve(process.cwd(), 'uploads', 'skills')
const META_FILE = resolve(SKILLS_DIR, '.skills.json')

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const id = getRouterParam(event, 'id') as string
  if (!existsSync(META_FILE)) throw createError({ statusCode: 404, message: '未找到该技能' })
  const list = JSON.parse(readFileSync(META_FILE, 'utf8'))
  const idx = list.findIndex((s: any) => s.id === id)
  if (idx === -1) throw createError({ statusCode: 404, message: '未找到该技能' })
  const skill = list[idx]
  // 删除目录
  try {
    rmSync(resolve(SKILLS_DIR, skill.dirName), { recursive: true, force: true })
  } catch {}
  list.splice(idx, 1)
  writeFileSync(META_FILE, JSON.stringify(list, null, 2))
  return { success: true }
})
