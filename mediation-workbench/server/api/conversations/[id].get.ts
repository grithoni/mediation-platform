// ============================================================
// GET /api/conversations/:id — 获取单个已保存对话（含消息）
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { savedConversations, cases } from '../../database/schema'
import { requireAuth } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)
  const id = getRouterParam(event, 'id') as string
  const db = getDb()

  const row: any = db
    .select({
      id: savedConversations.id,
      caseId: savedConversations.caseId,
      caseTitle: cases.title,
      mediatorId: savedConversations.mediatorId,
      title: savedConversations.title,
      messagesJson: savedConversations.messagesJson,
      messageCount: savedConversations.messageCount,
      createdAt: savedConversations.createdAt,
    })
    .from(savedConversations)
    .leftJoin(cases, eq(savedConversations.caseId, cases.id))
    .where(eq(savedConversations.id, id))
    .get()

  if (!row) throw createError({ statusCode: 404, message: '对话不存在' })
  if (row.mediatorId !== mediator.userId) throw createError({ statusCode: 403, message: '无权访问' })

  let messages: any[] = []
  try { messages = JSON.parse(row.messagesJson) } catch {}

  return {
    success: true,
    data: {
      id: row.id,
      caseId: row.caseId,
      caseTitle: row.caseTitle,
      title: row.title,
      messages,
      messageCount: row.messageCount,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    },
  }
})
