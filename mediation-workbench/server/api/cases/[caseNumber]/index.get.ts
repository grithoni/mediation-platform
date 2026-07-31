import { and, desc, eq, ne, or } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../../database'
import { cases, messages, documents, sessions } from '../../../database/schema'
import { verifyPartyAccess } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const caseNumber = getRouterParam(event, 'caseNumber')
  if (!caseNumber) {
    throw createError({ statusCode: 400, message: '缺少案件编号' })
  }

  const db = getDb()
  const query = getQuery(event)
  const user = event.context.user

  // --- Mode 1: Authenticated user (mediator, admin, etc.) ---
  if (user) {
    const caseData = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
    if (!caseData) {
      throw createError({ statusCode: 404, message: '案件不存在' })
    }

    // Mediator view: only see shared messages (party↔mediator), hide party↔AI private chat
    const caseMessages = db
      .select()
      .from(messages)
      .where(and(
        eq(messages.caseId, caseNumber),
        or(
          ne(messages.visibility, 'private'),
          eq(messages.channelType, 'caucus'),
        ),
      ))
      .orderBy(messages.createdAt)
      .all()

    const caseDocuments = db
      .select()
      .from(documents)
      .where(eq(documents.caseId, caseNumber))
      .orderBy(desc(documents.createdAt))
      .all()

    return {
      success: true,
      data: {
        ...caseData,
        messages: caseMessages,
        documents: caseDocuments,
      },
    }
  }

  // --- Mode 2: Party access via access code ---
  const code = query.code as string | undefined
  if (!code) {
    throw createError({ statusCode: 401, message: '请提供访问验证码或登录' })
  }

  const { valid, caseData } = verifyPartyAccess(caseNumber, code)
  if (!valid) {
    throw createError({ statusCode: 403, message: '访问验证码无效' })
  }

  // Reuse existing active session or create a new one
  const partyIdentifier = query.party as string || 'party'
  const existingSession = db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.caseId, caseNumber),
        eq(sessions.partyIdentifier, partyIdentifier),
        eq(sessions.isActive, true),
      )
    )
    .get()

  let sessionId: string
  if (existingSession) {
    sessionId = existingSession.id
  } else {
    sessionId = uuidv4()
    db.insert(sessions)
      .values({
        id: sessionId,
        caseId: caseNumber,
        partyIdentifier,
        isActive: true,
      })
      .run()
  }

  // Party can see: own messages + mediator messages + AI messages
  // Hide messages from the other party (if any)
  const caseMessages = db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.caseId, caseNumber),
        // Include: own party messages, mediator messages, AI messages
        // Exclude: messages from other party senders
        ne(messages.senderType, 'party'),
      )
    )
    .orderBy(messages.createdAt)
    .all()

  // Also include this party's own messages
  const ownMessages = db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.caseId, caseNumber),
        eq(messages.senderType, 'party'),
        eq(messages.senderId, partyIdentifier),
      )
    )
    .orderBy(messages.createdAt)
    .all()

  // Merge and sort by time
  const allCaseMessages = [...caseMessages, ...ownMessages]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  const caseDocuments = db
    .select()
    .from(documents)
    .where(eq(documents.caseId, caseNumber))
    .orderBy(desc(documents.createdAt))
    .all()

    return {
      success: true,
      data: {
        id: caseData.id,
        title: caseData.title,
        description: caseData.description,
        partyAName: caseData.partyAName,
        partyBName: caseData.partyBName,
        claimsSummary: caseData.claimsSummary,
        evidenceSummary: caseData.evidenceSummary,
        phase: caseData.phase || 'analysis',
        mediatorId: caseData.mediatorId || null,
        status: caseData.status,
        messages: allCaseMessages,
        documents: caseDocuments,
      },
      sessionToken: sessionId,
    }
})
