// ============================================================
// GET /api/conversations — 列出当前调解员的所有已保存对话
// ============================================================
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { savedConversations, cases } from '../../database/schema'
import { requireAuth } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)
  const db = getDb()
  const query = getQuery(event)
  const limit = Math.min(parseInt(String(query.limit || '20')), 100)

  const rows = db
    .select({
      id: savedConversations.id,
      caseId: savedConversations.caseId,
      caseTitle: cases.title,
      title: savedConversations.title,
      messageCount: savedConversations.messageCount,
      createdAt: savedConversations.createdAt,
    })
    .from(savedConversations)
    .leftJoin(cases, eq(savedConversations.caseId, cases.id))
    .where(eq(savedConversations.mediatorId, mediator.userId))
    .orderBy(desc(savedConversations.createdAt))
    .limit(limit)
    .all()

  return {
    success: true,
    data: rows.map((r: any) => ({
      id: r.id,
      caseId: r.caseId,
      caseTitle: r.caseTitle,
      title: r.title,
      messageCount: r.messageCount,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
  }
})
