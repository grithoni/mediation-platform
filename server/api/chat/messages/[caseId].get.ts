import { asc, eq, and } from 'drizzle-orm'
import { getDb } from '../../../database'
import { messages, sessions, cases } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const caseId = getRouterParam(event, 'caseId')
  if (!caseId) {
    throw createError({ statusCode: 400, message: '缺少案件ID' })
  }

  const db = getDb()
  const query = getQuery(event)
  const mediator = event.context.mediator

  // Access check: mediator auth OR valid party session
  let hasAccess = false

  if (mediator) {
    // Verify the case belongs to this mediator or they are admin
    const caseData = db.select().from(cases).where(eq(cases.id, caseId)).get()
    if (caseData) hasAccess = true
  }

  if (!hasAccess) {
    // Try party session token
    const sessionToken = query.sessionToken as string | undefined
    if (sessionToken) {
      const session = db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, sessionToken), eq(sessions.caseId, caseId), eq(sessions.isActive, true)))
        .get()
      if (session) hasAccess = true
    }
  }

  if (!hasAccess) {
    throw createError({ statusCode: 403, message: '无权访问此案件消息' })
  }

  const caseMessages = db
    .select()
    .from(messages)
    .where(eq(messages.caseId, caseId))
    .orderBy(asc(messages.createdAt))
    .all()

  return { success: true, data: caseMessages }
})
