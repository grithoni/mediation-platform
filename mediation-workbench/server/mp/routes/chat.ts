import type { Router } from 'h3'
import { defineEventHandler, readBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../database'
import { messages, cases } from '../../database/schema'
import { searchKb, formatKbResultsForPrompt } from '../../utils/kb-search'

/**
 * POST /api/mp/chat — AI chat
 */
export function chatRoutes(router: Router) {
  router.post('/api/mp/chat', defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { caseId, message, senderName } = body || {}
    if (!caseId || !message) throw createError({ statusCode: 400, message: '缺少 caseId 或 message' })

    const db = getDb()
    const user = (event as any).context.mpUser
    const caseRow = db.select().from(cases).where(eq(cases.id, caseId)).get()
    if (!caseRow) throw createError({ statusCode: 404, message: '案件不存在' })

    // Save user message
    const userMsgId = uuidv4()
    db.insert(messages).values({
      id: userMsgId, caseId, senderType: 'party', senderId: user.openid,
      senderName: senderName || '当事人', content: message, visibility: 'private',
    }).run()

    // Get recent history
    const recentMsgs = db.select().from(messages).where(eq(messages.caseId, caseId)).orderBy(messages.createdAt).limit(20).all()

    // RAG
    let kbContext = ''
    try {
      const kbResults = await searchKb(message, 3)
      if (kbResults.length > 0) kbContext = formatKbResultsForPrompt(kbResults)
    } catch {}

    const systemPrompt = `你是一个专业的商事调解 AI 助手。帮助当事人分析纠纷、理解法律权益，引导走向调解解决方案。

案件信息：
- 编号：${caseRow.id}
- 标题：${caseRow.title}
- 描述：${caseRow.description || '暂无'}
- 甲方：${caseRow.partyAName}
- 乙方：${caseRow.partyBName}

${kbContext ? `参考法律知识：\n${kbContext}\n` : ''}
要求：分阶段心理咨询（倾听→共情→重塑→协商），前3-4轮以倾听为主，回复100-200字，不编造法律条文。`

    const aiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...recentMsgs.map(m => ({
        role: (m.senderType === 'ai' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
    ]

    const baseUrl = process.env.NUXT_OPENAI_BASE_URL || ''
    const apiKey = process.env.NUXT_OPENAI_API_KEY || ''
    const model = process.env.NUXT_OPENAI_MODEL || 'gpt-4o-mini'
    if (!baseUrl || !apiKey) throw createError({ statusCode: 500, message: 'AI 服务未配置' })

    let aiContent: string
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: aiMessages, temperature: 0.7, max_tokens: 500 }),
      }).then(r => r.json()) as any
      aiContent = resp.choices?.[0]?.message?.content || '抱歉，AI 暂时无法回复。'
    } catch (err: any) {
      throw createError({ statusCode: 500, message: `AI 调用失败: ${err.message}` })
    }

    const aiMsgId = uuidv4()
    db.insert(messages).values({
      id: aiMsgId, caseId, senderType: 'ai', senderId: 'ai-assistant',
      senderName: 'AI助手', content: aiContent, visibility: 'private',
    }).run()

    return { success: true, data: { id: aiMsgId, content: aiContent, role: 'assistant' } }
  }))
}
