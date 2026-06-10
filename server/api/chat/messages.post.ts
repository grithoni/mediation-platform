// ============================================================
// POST /api/chat/messages — 发送消息（双方通用）
// ============================================================
import { v4 as uuidv4 } from 'uuid'
import { eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { messages, cases } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { caseId, content, senderType, senderName, senderId } = body || {}

  if (!caseId || !content) {
    throw createError({ statusCode: 400, message: '缺少 caseId 或 content' })
  }

  const db = getDb()

  // Verify case exists
  const caseData = db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  const msgId = uuidv4()
  const now = new Date()

  db.insert(messages)
    .values({
      id: msgId,
      caseId,
      senderType: senderType || 'party',
      senderId: senderId || null,
      senderName: senderName || '未知',
      content,
      createdAt: now,
    } as any)
    .run()

  // If mediator sends a message, clear the notification flag
  if (senderType === 'mediator' && caseData.mediatorRequestedAt) {
    db.update(cases).set({ mediatorRequestedAt: null }).where(eq(cases.id, caseId)).run()
  }

  return {
    success: true,
    data: {
      id: msgId,
      caseId,
      senderType: senderType || 'party',
      senderId: senderId || null,
      senderName: senderName || '未知',
      content,
      createdAt: now.toISOString(),
    },
  }
})
