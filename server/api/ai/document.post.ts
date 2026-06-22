import { requireMediator } from '~/server/middleware/auth'
import { getDb } from '~/server/database'
import { cases, caseDynamicFiles, messages } from '~/server/database/schema'
import { eq, desc } from 'drizzle-orm'
import { searchKb, formatKbResultsForPrompt } from '~/server/utils/kb-search'

export default defineEventHandler(async (event) => {
  const user = requireMediator(event)
  const body = await readBody(event)

  const { caseId, documentType = 'agreement' } = body

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  const config = useRuntimeConfig()
  if (!config.openaiApiKey) {
    throw createError({ statusCode: 500, message: '未配置 AI 模型 API Key' })
  }

  const db = getDb()
  const caseData = await db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  const dynamicFile = await db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseId)).get()

  const recentMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.caseId, caseId))
    .orderBy(desc(messages.createdAt))
    .limit(50)
    .all()

  const df = dynamicFile
  const msgs = recentMessages.reverse().map((m: any) => `[${m.senderName || m.senderType}] ${m.content}`).join('\n')

  const prompts: Record<string, string> = {
    agreement: `请生成调解协议草案，使用 Markdown 格式。包含：协议标题、当事人信息、争议事项、调解结果（和解条款）、履行方式与期限、违约责任、争议解决方式、签署栏。\n\n案件：${caseData.title}\n甲方：${caseData.partyAName}\n乙方：${caseData.partyBName}\n金额：${caseData.amount || '未知'}\n争议清单：${df?.disputeChecklist || '无'}\n立场：${df?.positions || '无'}\n潜在利益：${df?.potentialInterests || '无'}`,
    evidence_summary: `请生成证据摘要报告，使用 Markdown 格式。列出案件涉及的所有证据材料，按证据类型分类，标注证明力强弱。\n\n案件：${caseData.title}\n甲方：${caseData.partyAName}\n乙方：${caseData.partyBName}\n描述：${caseData.description || '无'}\n证据摘要：${caseData.evidenceSummary || '无'}\n对话：${msgs}`,
    mediation_report: `请生成调解工作报告，使用 Markdown 格式。包含：案件基本情况、调解过程、各方立场变化、调解结果、后续建议。\n\n案件：${caseData.title}\n甲方：${caseData.partyAName}\n乙方：${caseData.partyBName}\n阶段：${caseData.phase}\n当事人分析：${df?.partyAnalysis || '无'}\n时间线：${df?.timeline || '无'}\n对话：${msgs}`,
  }

  const prompt = prompts[documentType]
  if (!prompt) {
    throw createError({ statusCode: 400, message: '不支持的文档类型' })
  }

  let kbContext = ''
  try {
    const kbResults = await searchKb(caseData.title || '', 3)
    if (kbResults.length > 0) kbContext = formatKbResultsForPrompt(kbResults)
  } catch {}

  const { generateText } = await import('ai')
  const { createOpenAI } = await import('@ai-sdk/openai')
  const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey: config.openaiApiKey as string }
  if (config.openaiBaseUrl) openaiOptions.baseURL = config.openaiBaseUrl as string
  const openai = createOpenAI(openaiOptions)

  const result = await generateText({
    model: openai(config.openaiModel || 'gpt-4o-mini'),
    system: '你是专业的商事调解文档生成智能体。生成规范、专业的法律调解文书。' + kbContext,
    prompt,
    temperature: 0.4,
  })

  return {
    success: true,
    data: {
      documentType,
      content: result.text,
      caseId,
      generatedAt: new Date().toISOString(),
    },
  }
})
