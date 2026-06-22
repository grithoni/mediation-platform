// ============================================================
// POST /api/cases/bind-mediator — 绑定调解员到案件
// ============================================================
import { eq, and } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../database'
import { cases, messages } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const db = getDb()
  const body = await readBody(event)
  const { caseId, mediatorId } = body

  if (!caseId || !mediatorId) {
    return { success: false, error: '缺少 caseId 或 mediatorId' }
  }

  const nowUnix = Math.floor(Date.now() / 1000)

  db.update(cases)
    .set({
      mediatorId,
      mediatorBoundAt: nowUnix,
      mediatorRequestedAt: nowUnix,
      phase: 'mediating',
      status: 'active',
      updatedAt: Date.now(),
    })
    .where(eq(cases.id, caseId))
    .run()

  // Convert AI private messages to shared so mediator can see conversation history
  const converted = db.update(messages)
    .set({ visibility: 'shared' })
    .where(and(
      eq(messages.caseId, caseId),
      eq(messages.visibility, 'private'),
    ))
    .run()

  // Insert system message for mediator
  db.insert(messages).values({
    id: uuidv4(),
    caseId,
    senderType: 'system',
    senderId: 'system',
    senderName: '系统',
    content: '当事人已连线',
    visibility: 'shared',
  }).run()

  return { success: true, data: { caseId, mediatorId, boundAt: new Date().toISOString(), convertedMessages: converted.changes } }
})
