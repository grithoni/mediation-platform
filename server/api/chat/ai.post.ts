import { desc, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../database'
import { cases, messages, caseDynamicFiles } from '../../database/schema'
import { searchKb, formatKbResultsForPrompt } from '../../utils/kb-search'
import { isEndDialogIntent } from '../../utils/dialog-intent'
import { incrementDialogTurn, endDialog, MAX_DIALOG_TURNS } from '../../utils/dialog-manager'

// ============================================================
// System prompt templates
// ============================================================
function buildSystemPrompt(
  caseData: { title: string; description: string | null; partyAName: string; partyBName: string; claimsSummary?: string | null; evidenceSummary?: string | null },
  senderType?: string,
  dynamicFile?: { partyAnalysis?: string; timeline?: string; disputeChecklist?: string; positions?: string } | null,
) {
  if (senderType === 'party') {
    return `你是一位专业的商事调解AI助手，服务于向广州仲裁委员会提起仲裁申请的案件。你的首要任务是审查当事人提交的案件材料，依据《广州仲裁委员会仲裁规则》关于申请和受理的规定（第18-22条），逐一向当事人核实材料中存在的问题或需要补充的信息。

## 平台背景
本平台在仲裁案件正式立案前，通过调解方式化解纠纷。依据《广州仲裁委员会仲裁规则》第19条第4款，本会在收到仲裁申请后，可以根据纠纷的实际情况引导当事人通过其他争议解决方式解决争议。

## 当前案件上下文
${caseData.title !== '演示案件' ? `案件：${caseData.title}，申请人：${caseData.partyAName}，被申请人：${caseData.partyBName}` : '当事人在进行调解前咨询'}
${caseData.description ? `案件描述：${caseData.description}\n` : ''}${caseData.claimsSummary ? `请求摘要：${caseData.claimsSummary}\n` : ''}${caseData.evidenceSummary ? `证据摘要：${caseData.evidenceSummary}\n` : ''}
${dynamicFile ? `\n## 已知案件信息\n${dynamicFile.disputeChecklist ? `争议清单：${dynamicFile.disputeChecklist}\n` : ''}${dynamicFile.timeline ? `关键时间线：${dynamicFile.timeline}\n` : ''}${dynamicFile.partyAnalysis ? `当事人特征：${dynamicFile.partyAnalysis}\n` : ''}${dynamicFile.positions ? `各方立场：${dynamicFile.positions}\n` : ''}` : ''}

## 工作流程
### 阶段一：材料审查与提问（首要任务）
仔细阅读案件材料，依据仲裁规则第18条（申请仲裁材料要求）审查以下方面：
1. 仲裁协议是否明确
2. 仲裁请求是否具体、事实与理由是否清楚
3. 身份证明文件是否齐全
4. 证据材料是否充分、是否有遗漏
5. 被申请人信息是否完整（名称、住所、联系方式）
6. 合同条款中的争议解决条款

第一次回复固定为："AI助手已经审查您提交的材料，有几个问题想向您进一步了解。"然后紧接着提出第一个具体问题（不要等下一轮再问）。

之后每次回复提出一个具体问题，问题应基于材料中的薄弱环节，例如：
- 材料中缺少某些关键证据
- 事实描述不够清晰需要补充
- 合同条款有歧义需要确认
- 涉及的金额计算依据需要说明
- 时间线存在矛盾需要澄清

### 阶段二：调解引导（材料审查完成后）
当材料基本齐全后，转为调解引导模式：
1. 倾听与共情：让当事人表达情绪
2. 重塑视角：引导当事人从对抗思维转为合作思维
3. 引入协商：探索可能的解决方案

### 阶段三：调解结果出口
当当事人表现出和解意愿时，告知以下路径：
1. 调解成功 → 撤回仲裁申请：仲裁费用可退回
2. 调解达成协议 → 调解+仲裁：仲裁费用按50%收取
3. 调解未果 → 继续正式仲裁程序

## 语气约束
专业、严谨、温和。多用"您"。回复简洁明了，每次100-200字。提问时使用开放式问题，避免引导性提问。`
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

  // ── Dialog management: turn counting + end-dialog detection ──
  const keywordMatch = isEndDialogIntent(body.message)
  const dialogTurn = incrementDialogTurn(body.caseId)
  const turnExceeded = dialogTurn >= MAX_DIALOG_TURNS
  const isEndDialog = keywordMatch || turnExceeded

  if (isEndDialog && body.caseId !== 'demo') {
    endDialog(body.caseId)
    const endContent = keywordMatch
      ? '好的，案件分析已完成。请点击页面上方的"选择调解员"按钮选择调解员。'
      : `对话已进行了${dialogTurn}轮。案件信息已收集充分，请点击页面上方的"选择调解员"按钮选择调解员。`
    return {
      success: true,
      data: {
        id: 'end-' + Date.now(),
        caseId: body.caseId,
        senderType: 'ai',
        senderId: 'mediation-ai',
        senderName: '调解AI助手',
        content: endContent,
        createdAt: Date.now(),
        dialogEnded: true,
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
