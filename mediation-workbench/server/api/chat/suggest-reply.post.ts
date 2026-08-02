import { eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases, caseDynamicFiles, messages } from '../../database/schema'
import { searchKb, formatKbResultsForPrompt } from '../../utils/kb-search'
import { nanobotChat } from '../../utils/nanobot'

// POST /api/chat/suggest-reply
// Generate a suggested reply for the mediator based on latest party message
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { caseId, partyMessage, autoMode } = body

  if (!caseId || !partyMessage) {
    throw createError({ statusCode: 400, message: 'Missing caseId or partyMessage' })
  }

  const db = getDb()

  // Get case info
  const caseRow = db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseRow) throw createError({ statusCode: 404, message: '案件不存在' })

  // Get dynamic files for context
  const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseId)).get()

  // Get recent messages for context (last 10)
  const recentMsgs = db.select()
    .from(messages)
    .where(eq(messages.caseId, caseId))
    .orderBy(messages.createdAt)
    .all()
    .slice(-10)

  // Search KB for relevant legal knowledge
  let kbContext = ''
  try {
    const kbResults = await searchKb(partyMessage, 3)
    if (kbResults.length) {
      kbContext = formatKbResultsForPrompt(kbResults)
    }
  } catch {}

  // Build context
  const contextParts = [
    caseRow.title && `【案件】${caseRow.title}`,
    caseRow.description && `【案情】${caseRow.description.slice(0, 500)}`,
    df?.positions && `【各方立场】\n${df.positions.slice(0, 500)}`,
    df?.potentialInterests && `【潜在利益点】\n${df.potentialInterests.slice(0, 300)}`,
    df?.partyAnalysis && `【当事人特征】\n${df.partyAnalysis.slice(0, 300)}`,
    kbContext && `【相关法律知识】\n${kbContext}`,
  ].filter(Boolean).join('\n\n')

  // Build conversation history
  const history = recentMsgs.map(m => {
    const role = m.senderType === 'party' ? '当事人' : m.senderType === 'ai' ? 'AI助手' : '调解员'
    return `${role}: ${m.content}`
  }).join('\n')

  const systemPrompt = `你是一个经验丰富的商事调解专家，正在协助调解员回复当事人。

回复要求：
1. 语气专业、温和、不评判
2. 基于案件事实和法律知识，给出有针对性的回复
3. 回复 80-200 字，使用完整话术（可直接对当事人说）
4. 不要使用 Markdown 标题/加粗/列表符号
5. 对敏感法律点（合同效力、违约责任、诉讼时效）显式标注："需律师复核"
6. 注意倾听当事人的诉求，引导对话向解决争议的方向推进

${autoMode ? '当前是"智能应答"模式，你的回复将自动作为调解员的消息发送。请确保回复专业、准确。' : '当前是"人工应答"模式，你的回复将作为建议供调解员参考。调解员可以修改后发送。'}`

  const userPrompt = `案件背景：
${contextParts || '（暂无）'}

最近对话：
${history || '（暂无）'}

当事人最新消息：
${partyMessage}

请生成一条专业的调解员回复：`

  try {
    const content = await nanobotChat({
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.5,
      maxTokens: 500,
    })

    return {
      success: true,
      data: {
        content: content.trim(),
        generatedAt: new Date().toISOString(),
      },
    }
  } catch (err: any) {
    console.error('[suggest-reply] Error:', err.message)
    throw createError({ statusCode: 500, message: '生成回复建议失败' })
  }
})
