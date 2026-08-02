import { requireMediator } from '~/server/middleware/auth'
import { getDb } from '~/server/database'
import { cases, caseDynamicFiles, messages } from '~/server/database/schema'
import { eq, desc } from 'drizzle-orm'
import { searchKb, formatKbResultsForPrompt } from '~/server/utils/kb-search'
import { nanobotChat } from '~/server/utils/nanobot'

export default defineEventHandler(async (event) => {
  const user = requireMediator(event)
  const body = await readBody(event)

  const { caseId, suggestType = 'settlement', scenario } = body

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
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
    settlement: `请生成和解方案建议，返回 JSON：{"proposals":[{"id":"","title":"","description":"","terms":[],"amount":null,"performanceMethod":"","pros":[],"cons":[],"feasibility":"high/medium/low","aiConfidence":0.8}],"recommendedProposalId":"","reasoning":""}\n\n案件：${caseData.title}\n金额：${caseData.amount || '未知'}\n甲方：${caseData.partyAName}\n乙方：${caseData.partyBName}\n立场：${df?.positions || '无'}\nBATNA：${df?.batna || '无'}\n争点：${df?.disputeChecklist || '无'}`,
    strategy: `请分析谈判策略，返回 JSON：{"partyAStrategy":{"strengths":[],"weaknesses":[],"recommendedApproach":""},"partyBStrategy":{},"mediationApproach":{"style":"","techniques":[],"focusAreas":[]},"potentialObstacles":[],"overcomingStrategies":[]}\n\n案件：${caseData.title}\n金额：${caseData.amount || '未知'}\n立场：${df?.positions || '无'}\nBATNA：${df?.batna || '无'}`,
    summary: `请总结调解进展，返回 JSON：{"caseOverview":"","keyIssues":[],"progressMade":[],"remainingDisputes":[],"nextSteps":[],"estimatedSettlementChance":"high/medium/low"}\n\n案件：${caseData.title}\n甲方：${caseData.partyAName}\n乙方：${caseData.partyBName}\n争点：${df?.disputeChecklist || '无'}\n对话：${msgs}`,
    script: `请为调解员生成话术建议，返回 JSON：{"openingStatement":"","keyPoints":[],"suggestedQuestions":[],"responses":{"emotional":"","deadlock":"","agreement":""},"dos":[],"donts":[]}\n\n案件：${caseData.title}\n甲方：${caseData.partyAName}\n乙方：${caseData.partyBName}\n当事人分析：${df?.partyAnalysis || '无'}\n场景：${scenario || '通用'}`,
  }

  if (suggestType === 'script' && !scenario) {
    throw createError({ statusCode: 400, message: '调解场景不能为空' })
  }

  const prompt = (prompts[suggestType] || prompts.settlement)!

  let kbContext = ''
  try {
    const kbResults = await searchKb(caseData.title || '', 3)
    if (kbResults.length > 0) kbContext = formatKbResultsForPrompt(kbResults)
  } catch {}

  const text = await nanobotChat({
    system: '你是专业的商事调解智能体，专长调解策略和方案生成。输出严格 JSON。' + kbContext,
    prompt,
    temperature: 0.5,
  })

  let data: any
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    data = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text }
  } catch {
    data = { raw: text }
  }

  return { success: true, data }
})
