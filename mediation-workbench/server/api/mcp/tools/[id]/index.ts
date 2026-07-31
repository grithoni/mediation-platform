// ============================================================
// PUT /api/mcp/tools/:id — 更新 MCP 工具
// DELETE /api/mcp/tools/:id — 删除
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../database'
import { mcpTools } from '../../../../database/schema'
import { requireAuth } from '../../../../middleware/auth'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const db = getDb()
  const id = getRouterParam(event, 'id') as string

  if (event.method === 'DELETE') {
    db.delete(mcpTools).where(eq(mcpTools.id, id)).run()
    return { success: true }
  }

  if (event.method === 'PUT' || event.method === 'PATCH') {
    const body = await readBody(event)
    if (body.envJson) {
      try { JSON.parse(body.envJson) }
      catch { throw createError({ statusCode: 400, message: '环境变量 JSON 格式错误' }) }
    }
    const updates: Record<string, any> = { updatedAt: Date.now() }
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.transport !== undefined) updates.transport = body.transport
    if (body.command !== undefined) updates.command = body.command || null
    if (body.url !== undefined) updates.url = body.url || null
    if (body.envJson !== undefined) updates.envJson = body.envJson || null
    if (body.enabled !== undefined) updates.enabled = body.enabled
    db.update(mcpTools).set(updates as any).where(eq(mcpTools.id, id)).run()
    return { success: true }
  }
})
