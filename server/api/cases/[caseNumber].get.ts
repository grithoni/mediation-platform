import { and, desc, eq, ne } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../database'
import { cases, messages, documents, sessions } from '../../database/schema'
import { verifyPartyAccess } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const caseNumber = getRouterParam(event, 'caseNumber')
  if (!caseNumber) {
    throw createError({ statusCode: 400, message: '缺少案件编号' })
  }

  const db = getDb()
  const query = getQuery(event)
  const mediator = event.context.mediator

  // --- Mode 1: Authenticated mediator ---
  if (mediator) {
    const caseData = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
    if (!caseData) {
      throw createError({ statusCode: 404, message: '案件不存在' })
    }

    // Mediator view: only see shared messages (party↔mediator), hide party↔AI private chat
    const caseMessages = db
      .select()
      .from(messages)
      .where(and(eq(messages.caseId, caseNumber), ne(messages.visibility, 'private')))
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

  // Create a session token for the party
  const sessionId = uuidv4()
  db.insert(sessions)
    .values({
      id: sessionId,
      caseId: caseNumber,
      partyIdentifier: query.party as string || 'party',
      isActive: true,
      createdAt: new Date(),
    })
    .run()

  const caseMessages = db
    .select()
    .from(messages)
    .where(eq(messages.caseId, caseNumber))
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
        id: caseData.id,
        title: caseData.title,
        description: caseData.description,
        partyAName: caseData.partyAName,
        partyBName: caseData.partyBName,
        claimsSummary: caseData.claimsSummary,
        evidenceSummary: caseData.evidenceSummary,
        phase: (caseData as any).phase || 'analysis',
        mediatorId: (caseData as any).mediatorId || null,
        status: caseData.status,
        messages: caseMessages,
        documents: caseDocuments,
      },
      sessionToken: sessionId,
    }
})
