import { v4 as uuidv4 } from 'uuid'
import { eq, and } from 'drizzle-orm'
import { getDb } from '../../../database'
import { cases, messages } from '../../../database/schema'

// ============================================================
// POST /api/cases/:caseNumber/call-mediator
// Party requests mediator intervention
// 1. Set mediator_requested_at on case
// 2. Convert all 'private' messages → 'shared' (so mediator can see AI history)
// 3. Insert system message notifying mediator
// ============================================================
export default defineEventHandler(async (event) => {
  const caseNumber = getRouterParam(event, 'caseNumber')
  if (!caseNumber) {
    throw createError({ statusCode: 400, message: 'Missing caseNumber' })
  }

  const db = getDb()
  const now = Date.now()

  // Verify case exists and has a mediator bound
  const caseRow = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
  if (!caseRow) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }
  if (!caseRow.mediatorId) {
    throw createError({ statusCode: 400, message: '尚未绑定调解员，请先选择调解员' })
  }

  // 1. Set mediator_requested_at
  db.update(cases).set({ mediatorRequestedAt: now }).where(eq(cases.id, caseNumber)).run()

  // 2. Convert all private messages → shared for this case
  const updated = db.update(messages)
    .set({ visibility: 'shared' })
    .where(and(eq(messages.caseId, caseNumber), eq(messages.visibility, 'private')))
    .run()
  console.log(`[call-mediator] case=${caseNumber} converted ${updated.changes || 0} private→shared`)

  // 3. Insert system message
  const systemMsgId = uuidv4()
  db.insert(messages).values({
    id: systemMsgId,
    caseId: caseNumber,
    senderType: 'system',
    senderId: 'system',
    senderName: '系统',
    content: '当事人请求调解员介入，AI咨询记录已对调解员可见。',
    visibility: 'shared',
  }).run()

  return {
    success: true,
    message: '调解员已收到通知，请等待回复',
    convertedCount: updated.changes || 0,
  }
})
