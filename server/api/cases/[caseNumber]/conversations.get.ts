// ============================================================
// GET /api/cases/:caseNumber/conversations — 列出案件下已保存的对话
// ============================================================
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { savedConversations } from '../../../database/schema'
import { requireAuth } from '../../../middleware/auth'

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const db = getDb()

  const rows = db
    .select({
      id: savedConversations.id,
      caseId: savedConversations.caseId,
      mediatorId: savedConversations.mediatorId,
      title: savedConversations.title,
      messageCount: savedConversations.messageCount,
      createdAt: savedConversations.createdAt,
    })
    .from(savedConversations)
    .where(and(eq(savedConversations.caseId, caseNumber), eq(savedConversations.mediatorId, mediator.userId)))
    .orderBy(desc(savedConversations.createdAt))
    .all()

  return { success: true, data: rows.map((r: any) => ({ ...r, createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt })) }
})
