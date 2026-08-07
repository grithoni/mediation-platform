import type { Router } from 'h3'
import { defineEventHandler, readBody, createError } from 'h3'
import { eq, desc } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../database'
import { messages, cases } from '../../database/schema'
import { canAccessMpCase } from '../authz'

/**
 * GET  /api/mp/messages/:caseId — List messages
 * POST /api/mp/messages/:caseId — Send message
 */
export function messageRoutes(router: Router) {
  const db = getDb()
  router.get('/api/mp/messages/:caseId', defineEventHandler(async (event) => {
    const caseId = (event as any).context.params?.caseId
    if (!caseId) throw createError({ statusCode: 400, message: '缺少案件编号' })
    const user = (event as any).context.mpUser
    if (!canAccessMpCase(user, caseId)) {
      throw createError({ statusCode: 403, message: '无权访问该案件' })
    }
    const caseRow = db.select().from(cases).where(eq(cases.id, caseId)).get()
    if (!caseRow) throw createError({ statusCode: 404, message: '案件不存在' })
    const msgs = db.select().from(messages).where(eq(messages.caseId, caseId)).orderBy(desc(messages.createdAt)).limit(100).all()
    return {
      success: true,
      data: msgs.reverse().map(m => ({
        id: m.id, senderType: m.senderType, senderId: m.senderId,
        senderName: m.senderName, content: m.content, visibility: m.visibility, createdAt: m.createdAt,
      })),
    }
  }))

  router.post('/api/mp/messages/:caseId', defineEventHandler(async (event) => {
    const caseId = (event as any).context.params?.caseId
    if (!caseId) throw createError({ statusCode: 400, message: '缺少案件编号' })
    const body = await readBody(event)
    const { content, senderName } = body || {}
    if (!content) throw createError({ statusCode: 400, message: '消息内容不能为空' })
    const user = (event as any).context.mpUser
    if (!canAccessMpCase(user, caseId)) {
      throw createError({ statusCode: 403, message: '无权访问该案件' })
    }
    const caseRow = db.select().from(cases).where(eq(cases.id, caseId)).get()
    if (!caseRow) throw createError({ statusCode: 404, message: '案件不存在' })
    const msgId = uuidv4()
    db.insert(messages).values({
      id: msgId, caseId, senderType: 'party', senderId: user.openid,
      senderName: senderName || '当事人', content, visibility: 'shared',
    }).run()
    return { success: true, data: { id: msgId } }
  }))
}
