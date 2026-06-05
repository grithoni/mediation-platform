import { desc, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../database'
import { cases, messages, caseDynamicFiles } from '../../database/schema'

// ============================================================
// System prompt template for mediation AI
// ============================================================
function buildSystemPrompt(caseData: { title: string; description: string | null; partyAName: string; partyBName: string }) {
  return `你是一位专业的商事调解AI助手，正在协助处理以下调解案件：

案件标题：${caseData.title}
案件描述：${caseData.description || '无'}
甲方：${caseData.partyAName}
乙方：${caseData.partyBName}

你的职责：
1. 以中立、专业的态度与当事人沟通
2. 帮助当事人理清争议焦点
3. 引导双方寻找共赢的解决方案
4. 提供相关法律知识参考（但不构成法律建议）
5. 保持耐心和同理心

回复要求：
- 使用简洁明了的中文
- 适当提问以了解当事人的真实诉求
- 在适当时提出调解建议
- 每次回复控制在200字以内`
}

// ============================================================
// AI Chat endpoint
// ============================================================
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.caseId || !body?.message || !body?.senderIdentifier) {
    throw createError({ statusCode: 400, message: '缺少必要参数' })
  }

  // Keyword intercept (same as agent.post.ts)
  const endDialogKeywords = [
    '分配调解员', '选择调解员', '我要找调解员', '帮我找调解员',
    '我要联系调解员', '联系调解员', '结束谈话', '结束对话', '结束',
    '就这样', '可以了', '不用了', '不需要', '无需', '无补充',
    '不需要调解', '找调解员', '推荐调解员', '安排调解员', '帮我联系', '帮我找',
  ]
  const msgClean = (body.message as string).replace(/\s/g, '')
  if (endDialogKeywords.some(kw => msgClean.includes(kw)) && body.caseId !== 'demo') {
    const dbPre = getDb()
    const nowDate = new Date()
    const nowUnix = Math.floor(Date.now() / 1000)
    // End dialog
    const existing = dbPre.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, body.caseId)).get()
    if (existing) {
      dbPre.update(caseDynamicFiles).set({ dialogEnded: true, updatedAt: nowDate } as any).where(eq(caseDynamicFiles.caseId, body.caseId)).run()
    } else {
      dbPre.insert(caseDynamicFiles).values({
        id: body.caseId, caseId: body.caseId, dialogEnded: true, dialogTurnCount: 0,
        createdAt: nowDate, updatedAt: nowDate,
      } as any).run()
    }
    dbPre.update(cases).set({ phase: 'mediator_selection', updatedAt: nowDate } as any).where(eq(cases.id, body.caseId)).run()

    return {
      success: true,
      data: {
        id: 'keyword-' + body.caseId,
        caseId: body.caseId,
        senderType: 'ai' as const,
        senderId: 'mediation-ai',
        senderName: 'AI助手',
        content: '好的，案件分析已完成。请点击页面上方的"选择调解员"按钮选择调解员。',
        createdAt: new Date().toISOString(),
        dialogEnded: true,
      },
    }
  }

  const db = getDb()

  // Verify case exists
  const caseData = db.select().from(cases).where(eq(cases.id, body.caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  const now = new Date()

  // Save party message to DB (skip for skill/internal calls)
  let partyMessageId = 'skill-' + Date.now()
  if (!body.skipSave) {
    db.insert(messages)
    .values({
      id: partyMessageId,
      caseId: body.caseId,
      senderType: 'party',
      senderId: body.senderIdentifier,
      senderName: body.senderName || body.senderIdentifier,
      content: body.message,
      createdAt: now,
    })
    .run()
  }

  // Load conversation history (last 20 messages)
  const history = db
    .select()
    .from(messages)
    .where(eq(messages.caseId, body.caseId))
    .orderBy(desc(messages.createdAt))
    .limit(20)
    .all()
    .reverse() // chronological order

  // Try AI response
  let aiContent: string
  const config = useRuntimeConfig()

  if (config.openaiApiKey) {
    try {
      const { generateText } = await import('ai')
      const { createOpenAI } = await import('@ai-sdk/openai')

      const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey: config.openaiApiKey }
      if (config.openaiBaseUrl) {
        openaiOptions.baseURL = config.openaiBaseUrl
      }
      const openai = createOpenAI(openaiOptions)

      const chatMessages = history.map((m) => ({
        role: (m.senderType === 'ai' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `${m.senderName ? `[${m.senderName}] ` : ''}${m.content}`,
      }))

      const result = await generateText({
        model: openai(config.openaiModel || 'gpt-4o-mini'),
        system: buildSystemPrompt(caseData),
        messages: chatMessages,
      })

      aiContent = result.text
    } catch (err: any) {
      console.error('AI call failed, falling back to mock:', err.message)
      aiContent = generateMockResponse(body.message)
    }
  } else {
    aiContent = generateMockResponse(body.message)
  }

  // Save AI response to DB (skip for skill/internal calls)
  let aiMessageId = 'ai-skill-' + Date.now()
  const aiCreatedAt = new Date()
  if (!body.skipSave) {
    aiMessageId = uuidv4()
    db.insert(messages)
    .values({
      id: aiMessageId,
      caseId: body.caseId,
      senderType: 'ai',
      senderId: 'mediation-ai',
      senderName: '调解AI助手',
      content: aiContent,
      createdAt: aiCreatedAt,
    })
    .run()
  }

  return {
    success: true,
    data: {
      id: aiMessageId,
      caseId: body.caseId,
      senderType: 'ai',
      senderId: 'mediation-ai',
      senderName: '调解AI助手',
      content: aiContent,
      createdAt: aiCreatedAt.toISOString(),
    },
  }
})

// ============================================================
// Mock response when no AI key is configured
// ============================================================
function generateMockResponse(partyMessage: string): string {
  const responses = [
    `感谢您的陈述。关于您提到的"${partyMessage.slice(0, 20)}..."，我需要了解更多细节。请问您能否提供相关的合同或协议文件？`,
    `我理解您的关切。在商事调解中，双方的合法权益都会得到充分尊重。请问对方对此有什么看法？`,
    `这是一个值得深入讨论的问题。建议我们先梳理一下争议的核心要点，然后逐一寻找解决方案。`,
    `感谢您的耐心沟通。为了更好地推进调解，我建议我们聚焦于以下几个关键问题...`,
    `我注意到双方在某些方面存在共识，这是一个积极的信号。让我们在此基础上继续探讨可行的解决方案。`,
  ]
  return responses[Math.floor(Math.random() * responses.length)]
}
