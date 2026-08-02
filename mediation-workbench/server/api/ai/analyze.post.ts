import { requireMediator } from '~/server/middleware/auth'
import { getDb } from '~/server/database'
import { cases, caseDynamicFiles, messages } from '~/server/database/schema'
import { eq, desc } from 'drizzle-orm'
import { searchKb, formatKbResultsForPrompt } from '~/server/utils/kb-search'
import { nanobotChat } from '~/server/utils/nanobot'

export default defineEventHandler(async (event) => {
  const user = requireMediator(event)
  const body = await readBody(event)

  const { caseId, analysisType = 'comprehensive' } = body

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
    issues: `请提取以下案件的争议焦点，返回 JSON 格式：{"issues":[{"id":"","title":"","description":"","category":"","priority":"high/medium/low","partyAPosition":"","partyBPosition":""}],"summary":""}\n\n案件：${caseData.title}\n甲方：${caseData.partyAName}\n乙方：${caseData.partyBName}\n描述：${caseData.description || '无'}\n立场：${df?.positions || '无'}\n对话：${msgs}`,
    interests: `请分析案件各方利益，返回 JSON：{"partyAInterests":[],"partyBInterests":[],"commonInterests":[],"conflictingInterests":[]}\n\n案件：${caseData.title}\n甲方：${caseData.partyAName}\n乙方：${caseData.partyBName}\n立场：${df?.positions || '无'}\n潜在利益：${df?.potentialInterests || '无'}`,
    batna: `请进行 BATNA 分析，返回 JSON：{"partyA":{"alternatives":[],"bestAlternative":"","walkAwayPoint":"","strength":"strong/moderate/weak"},"partyB":{},"zoneOfPossibleAgreement":"","recommendations":[]}\n\n案件：${caseData.title}\n金额：${caseData.amount || '未知'}\n甲方：${caseData.partyAName}\n乙方：${caseData.partyBName}\n立场：${df?.positions || '无'}`,
    comprehensive: `请对案件进行综合分析，返回 JSON：{"caseType":"","keyFacts":[],"legalIssues":[],"riskAssessment":{"level":"high/medium/low","factors":[]},"suggestedApproach":"","estimatedDuration":""}\n\n案件：${caseData.title}\n描述：${caseData.description || '无'}\n甲方：${caseData.partyAName}\n乙方：${caseData.partyBName}\n争议清单：${df?.disputeChecklist || '无'}\n时间线：${df?.timeline || '无'}`,
  }

  const prompt = (prompts[analysisType] || prompts.comprehensive)!

  let kbContext = ''
  try {
    const kbResults = await searchKb(caseData.title || '', 3)
    if (kbResults.length > 0) kbContext = formatKbResultsForPrompt(kbResults)
  } catch {}

  const text = await nanobotChat({
    system: '你是专业的商事调解案件分析智能体。使用结构化 JSON 格式输出分析结果。' + kbContext,
    prompt,
    temperature: 0.3,
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
