// ============================================================
// POST /api/mcp/tools/:id/toggle — 启用/禁用
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../database'
import { mcpTools } from '../../../../database/schema'
import { requireAuth } from '../../../../middleware/auth'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const db = getDb()
  const id = getRouterParam(event, 'id') as string
  const tool = db.select().from(mcpTools).where(eq(mcpTools.id, id)).get()
  if (!tool) throw createError({ statusCode: 404, message: '未找到该工具' })
  db.update(mcpTools).set({ enabled: !tool.enabled, updatedAt: new Date() } as any).where(eq(mcpTools.id, id)).run()
  return { success: true, enabled: !tool.enabled }
})
