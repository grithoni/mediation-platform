// ============================================================
// POST /api/cases/:caseNumber/conversations — 保存当前对话为快照
// Supports both mediator (auth session) and party (session token)
// ============================================================
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../../database'
import { savedConversations } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const body = await readBody(event)

  const msgs = Array.isArray(body?.messages) ? body.messages : []
  if (msgs.length === 0) {
    throw createError({ statusCode: 400, message: '没有可保存的消息' })
  }

  // Determine who is saving: mediator (auth) or party (session token)
  const mediator = event.context.mediator as { id: string; name: string } | null
  const savedBy = body?.savedBy || 'mediator'
  const partyIdentifier = body?.partyIdentifier || null

  const mediatorId = mediator?.id || null
  const titlePrefix = savedBy === 'party' ? '[当事人退出]' : ''

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const title = body?.title || `${titlePrefix}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

  const db = getDb()
  const id = uuidv4()
  db.insert(savedConversations).values({
    id,
    caseId: caseNumber,
    mediatorId: mediatorId || 'party', // fallback for party saves
    title,
    messagesJson: JSON.stringify(msgs),
    messageCount: msgs.length,
    createdAt: now,
  }).run()

  return { success: true, data: { id, title, messageCount: msgs.length, createdAt: now.toISOString() } }
})
