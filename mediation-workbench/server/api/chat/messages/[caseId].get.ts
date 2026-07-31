import { asc, eq, and, ne, or } from 'drizzle-orm'
import { getDb } from '../../../database'
import { messages, cases } from '../../../database/schema'
import { classifyMessageActor, resolvePartySessionToken } from '../../../utils/chat-workflow'

export default defineEventHandler(async (event) => {
  const caseId = getRouterParam(event, 'caseId')
  if (!caseId) {
    throw createError({ statusCode: 400, message: '缺少案件ID' })
  }

  const db = getDb()
  const query = getQuery(event)
  const actor = classifyMessageActor({
    user: event.context.user,
    mediator: event.context.mediator,
  })

  // Access check: mediator auth OR valid party session
  let hasAccess = false

  if (actor.kind === 'mediator') {
    // Verify the case belongs to this mediator or they are admin
    const caseData = db.select().from(cases).where(eq(cases.id, caseId)).get()
    if (caseData) hasAccess = true
  }

  if (!hasAccess) {
    // Try party session token
    const sessionToken = query.sessionToken as string | undefined
    if (sessionToken) {
      const session = resolvePartySessionToken(db, { caseId, sessionToken })
      if (session) hasAccess = true
    }
  }

  if (!hasAccess) {
    throw createError({ statusCode: 403, message: '无权访问此案件消息' })
  }

  // Mediator: hide party↔AI private messages
  // Party: see all messages (their own private AI chat is visible to them)
  const whereCondition = actor.kind === 'mediator'
    ? and(
        eq(messages.caseId, caseId),
        or(
          ne(messages.visibility, 'private'),
          eq(messages.channelType, 'caucus'),
        ),
      )
    : eq(messages.caseId, caseId)

  const caseMessages = db
    .select()
    .from(messages)
    .where(whereCondition)
    .orderBy(asc(messages.createdAt))
    .all()

  return { success: true, data: caseMessages }
})
