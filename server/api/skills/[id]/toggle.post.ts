// ============================================================
// POST /api/skills/:id/toggle — 启用/禁用技能
// ============================================================
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { requireAuth } from '../../../middleware/auth'

const META_FILE = resolve(process.cwd(), 'uploads', 'skills', '.skills.json')

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const id = getRouterParam(event, 'id') as string
  if (!existsSync(META_FILE)) throw createError({ statusCode: 404, message: '未找到该技能' })
  const list = JSON.parse(readFileSync(META_FILE, 'utf8'))
  const skill = list.find((s: any) => s.id === id)
  if (!skill) throw createError({ statusCode: 404, message: '未找到该技能' })
  skill.enabled = !skill.enabled
  writeFileSync(META_FILE, JSON.stringify(list, null, 2))
  return { success: true, enabled: skill.enabled }
})
