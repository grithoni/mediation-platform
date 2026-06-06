// ============================================================
// POST /api/cases/:caseNumber/conversations — 保存当前对话为快照
// ============================================================
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../../database'
import { savedConversations } from '../../../database/schema'
import { requireAuth } from '../../../middleware/auth'

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const body = await readBody(event)

  const msgs = Array.isArray(body?.messages) ? body.messages : []
  if (msgs.length === 0) {
    throw createError({ statusCode: 400, message: '没有可保存的消息' })
  }

  const now = new Date()
  // 标题：YYYY-MM-DD HH:MM（本地时间）
  const pad = (n: number) => String(n).padStart(2, '0')
  const title = body?.title || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

  const db = getDb()
  const id = uuidv4()
  db.insert(savedConversations).values({
    id,
    caseId: caseNumber,
    mediatorId: mediator.id,
    title,
    messagesJson: JSON.stringify(msgs),
    messageCount: msgs.length,
    createdAt: now,
  } as any).run()

  return { success: true, data: { id, title, messageCount: msgs.length, createdAt: now.toISOString() } }
})
