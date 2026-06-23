// ============================================================
// POST /api/chat/messages — 发送消息（双方通用）
// ============================================================
import { v4 as uuidv4 } from 'uuid'
import { eq, and } from 'drizzle-orm'
import { getDb } from '../../database'
import { messages, cases, sessions } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { caseId, content, senderType, senderName, senderId, sessionToken } = body || {}

  if (!caseId || !content) {
    throw createError({ statusCode: 400, message: '缺少 caseId 或 content' })
  }

  // Auth: require JWT user, mediator session, or party session token
  const user = event.context.user
  const mediator = event.context.mediator
  let isPartySession = false

  if (!user && !mediator) {
    // Fallback: check party session token
    if (sessionToken) {
      const db = getDb()
      const sess = db.select().from(sessions).where(
        and(
          eq(sessions.caseId, caseId),
          eq(sessions.partyIdentifier, sessionToken),
          eq(sessions.isActive, true),
        ),
      ).get()
      if (!sess) {
        throw createError({ statusCode: 401, message: '会话无效或已过期' })
      }
      isPartySession = true
    } else {
      throw createError({ statusCode: 401, message: '请先登录' })
    }
  }

  // Validate senderType matches authenticated role
  const effectiveType = senderType || 'party'
  if (isPartySession) {
    // Party session: only allow sending as party
    if (effectiveType !== 'party' && effectiveType !== 'system') {
      throw createError({ statusCode: 403, message: '发送者身份与认证身份不匹配' })
    }
  } else {
    const authRole = user?.role || mediator?.role || 'party'
    const roleToSenderMap: Record<string, string> = {
      admin: 'mediator',
      case_manager: 'mediator',
      mediator: 'mediator',
      claimant: 'party',
      respondent: 'party',
    }
    const expectedType = roleToSenderMap[authRole] || 'party'
    if (effectiveType !== expectedType && effectiveType !== 'system') {
      throw createError({ statusCode: 403, message: '发送者身份与认证身份不匹配' })
    }
  }

  const db = getDb()

  // Verify case exists
  const caseData = db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  const msgId = uuidv4()
  const now = Date.now()

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
      createdAt: new Date(now).toISOString(),
    },
  }
})
