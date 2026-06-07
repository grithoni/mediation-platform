import { desc, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../database'
import { cases, messages, caseDynamicFiles } from '../../database/schema'
import { searchKb, formatKbResultsForPrompt } from '../../utils/kb-search'
import { isEndDialogIntent } from '../../utils/dialog-intent'
import { endDialog } from '../../utils/dialog-manager'

// ============================================================
// System prompt templates
// ============================================================
function buildSystemPrompt(
  caseData: { title: string; description: string | null; partyAName: string; partyBName: string },
  senderType?: string,
  dynamicFile?: { partyAnalysis?: string; timeline?: string; disputeChecklist?: string; positions?: string } | null,
) {
  if (senderType === 'party') {
    return `你是一位拥有多年经验、极具亲和力和同理心的专业矛盾调解员。你的核心任务不是立刻裁判对错或给出解决方案，而是通过高质量的倾听和共情，成为当事人的"情绪树洞"和"心理缓冲带"，缓解其对立情绪，引导其重回理性协商的轨道。

## 当前案件上下文
${caseData.title !== '演示案件' ? `案件：${caseData.title}，申请人：${caseData.partyAName}，被申请人：${caseData.partyBName}` : '当事人在进行调解前咨询'}
${dynamicFile ? `\n## 已知案件信息\n${dynamicFile.disputeChecklist ? `争议清单：${dynamicFile.disputeChecklist}\n` : ''}${dynamicFile.timeline ? `关键时间线：${dynamicFile.timeline}\n` : ''}${dynamicFile.partyAnalysis ? `当事人特征：${dynamicFile.partyAnalysis}\n` : ''}${dynamicFile.positions ? `各方立场：${dynamicFile.positions}\n` : ''}` : ''}

## 核心目标
1. 缓和情绪：让当事人积压的愤怒、委屈、焦虑等负面情绪得到安全释放
2. 建立信任：通过无偏见、不批判的态度，让当事人感受到被理解和被尊重
3. 转化视角：促使当事人从"对抗思维"逐步转变为"合作思维"
4. 引导协商：最终让当事人表达出愿意沟通解决的意愿

## 工作流
阶段一（前3-4轮）：倾听与情绪宣泄。多听少说，绝不打断，不做价值判断。用"嗯，我听着呢"、"您继续说"。严禁提出解决方案或和解建议。
阶段二（中期待情绪缓和后）：深度共情。如："听得出来，这件事让您感到非常委屈……换作任何人都会和您一样生气。"
阶段三（过渡期）：重塑视角。如："如果有一个机会能一劳永逸地解决这个麻烦，您最希望达到的结果是什么？"
阶段四（后期）：引入协商。如："如果有一座桥梁能把您的想法传达给对方，您愿意尝试一下吗？"

## 语气约束
温暖、沉稳、克制。多用"您"。即使在共情时也绝不攻击另一方。通俗口语，严禁法律条文或官话。每次回复100-200字。

## 首次回复
以一句充满温暖、引导对方开口的欢迎语开始。`
  }

  return `你是一位专业的商事调解AI助手。案件：${caseData.title}。甲方：${caseData.partyAName}。乙方：${caseData.partyBName}。
职责：以中立专业态度协助调解员，帮助分析争议焦点和法律依据。回复简洁中文，200字以内。`
}

function generateMockResponse(message: string): string {
  const responses = [
    '理解您的情况。请详细描述一下争议的具体经过，这有助于我们更好地分析问题。',
    '这是一个值得关注的问题。建议我们先梳理争议的核心要点，然后逐一寻找解决方案。',
    '感谢您的信任。调解的关键在于双方的沟通意愿，我们可以一起探讨可能的路径。',
    '您提出的问题很有代表性。在调解实践中，我们通常会先了解双方的真实诉求，再寻求平衡点。',
  ]
  return responses[Math.floor(Math.random() * responses.length)] || responses[0]!
}

// ============================================================
// AI Chat endpoint
// ============================================================
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.caseId || !body?.message || !body?.senderIdentifier) {
    throw createError({ statusCode: 400, message: '缺少必要参数' })
  }

  // Keyword intercept (shared utility)
  if (isEndDialogIntent(body.message) && body.caseId !== 'demo') {
    endDialog(body.caseId)
    return {
      success: true,
      data: {
        id: 'keyword-' + body.caseId, caseId: body.caseId,
        senderType: 'ai' as const, senderId: 'mediation-ai', senderName: 'AI助手',
        content: '好的，案件分析已完成。请点击页面上方的"选择调解员"按钮选择调解员。',
        createdAt: new Date().toISOString(), dialogEnded: true,
      },
    }
  }

  const db = getDb()
  const caseData = db.select().from(cases).where(eq(cases.id, body.caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // Fetch dynamic file for context
  let dynamicFile = null
  try {
    const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, body.caseId)).get()
    if (df) dynamicFile = { partyAnalysis: df.partyAnalysis ?? undefined, timeline: df.timeline ?? undefined, disputeChecklist: df.disputeChecklist ?? undefined, positions: df.positions ?? undefined }
  } catch (err) {
    console.error('[AI] Failed to load dynamic file:', err)
  }

  const now = new Date()
  let partyMessageId = 'skill-' + Date.now()
  if (!body.skipSave) {
    partyMessageId = uuidv4()
    db.insert(messages).values({
      id: partyMessageId, caseId: body.caseId,
      senderType: 'party', senderId: body.senderIdentifier,
      senderName: body.senderName || body.senderIdentifier,
      content: body.message,
      visibility: 'private',
    }).run()
  }

  const history = db.select().from(messages)
    .where(eq(messages.caseId, body.caseId))
    .orderBy(desc(messages.createdAt)).limit(20).all().reverse()

  // ── RAG: Search KB for relevant legal provisions ────────
  let systemPrompt = buildSystemPrompt(caseData, body.senderType || body.senderIdentifier, dynamicFile)
  try {
    const kbResults = await searchKb(body.message, 3)
    if (kbResults.length > 0) {
      systemPrompt += formatKbResultsForPrompt(kbResults)
      console.log(`[RAG] Injected ${kbResults.length} KB results for: "${body.message.slice(0, 50)}"`)
    }
  } catch {}

  let aiContent: string
  const config = useRuntimeConfig()
  if (config.openaiApiKey) {
    try {
      const { generateText } = await import('ai')
      const { createOpenAI } = await import('@ai-sdk/openai')
      const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey: config.openaiApiKey }
      if (config.openaiBaseUrl) openaiOptions.baseURL = config.openaiBaseUrl
      const openai = createOpenAI(openaiOptions)
      const chatMessages = history.map((m) => ({
        role: (m.senderType === 'ai' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `${m.senderName ? `[${m.senderName}] ` : ''}${m.content}`,
      }))
      const result = await generateText({
        model: openai(config.openaiModel || 'gpt-4o-mini'),
        system: systemPrompt,
        messages: chatMessages,
      })
      aiContent = result.text
    } catch (err: any) {
      console.error('AI call failed:', err.message)
      aiContent = generateMockResponse(body.message)
    }
  } else {
    aiContent = generateMockResponse(body.message)
  }

  let aiMessageId = 'ai-skill-' + Date.now()
  const aiCreatedAt = new Date()
  if (!body.skipSave) {
    aiMessageId = uuidv4()
    db.insert(messages).values({
      id: aiMessageId, caseId: body.caseId,
      senderType: 'ai', senderId: 'mediation-ai', senderName: '调解AI助手',
      content: aiContent,
      visibility: 'private',
    }).run()
  }

  return {
    success: true,
    data: {
      id: aiMessageId, caseId: body.caseId,
      senderType: 'ai', senderId: 'mediation-ai', senderName: '调解AI助手',
      content: aiContent, createdAt: aiCreatedAt.toISOString(),
    },
  }
})
