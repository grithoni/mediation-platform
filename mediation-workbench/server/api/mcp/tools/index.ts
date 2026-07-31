// ============================================================
// GET /api/mcp/tools — 列出所有 MCP 工具
// POST /api/mcp/tools — 新增 MCP 工具
// ============================================================
import { v4 as uuidv4 } from 'uuid'
import { desc } from 'drizzle-orm'
import { getDb } from '../../../database'
import { mcpTools } from '../../../database/schema'
import { requireAuth } from '../../../middleware/auth'

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)
  const db = getDb()

  if (event.method === 'GET') {
    const list = db.select().from(mcpTools).orderBy(desc(mcpTools.createdAt)).all()
    return { success: true, tools: list }
  }

  if (event.method === 'POST') {
    const body = await readBody(event)
    if (!body?.name?.trim()) throw createError({ statusCode: 400, message: '请输入名称' })
    if (body.transport !== 'stdio' && body.transport !== 'http') {
      throw createError({ statusCode: 400, message: '传输方式必须是 stdio 或 http' })
    }
    if (body.transport === 'stdio' && !body.command?.trim()) {
      throw createError({ statusCode: 400, message: 'stdio 传输需要命令' })
    }
    if (body.transport === 'http' && !body.url?.trim()) {
      throw createError({ statusCode: 400, message: 'http 传输需要 URL' })
    }
    if (body.envJson) {
      try { JSON.parse(body.envJson) }
      catch { throw createError({ statusCode: 400, message: '环境变量 JSON 格式错误' }) }
    }
    const id = uuidv4()
    const now = new Date()
    db.insert(mcpTools).values({
      id,
      name: body.name.trim(),
      description: body.description || '',
      transport: body.transport,
      command: body.command || null,
      url: body.url || null,
      envJson: body.envJson || null,
      enabled: true,
      createdBy: mediator.username,
      createdAt: now,
      updatedAt: now,
    } as any).run()
    return { success: true, id }
  }
})
