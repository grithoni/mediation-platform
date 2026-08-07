import { eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { cases, caseDynamicFiles } from '../../../database/schema'
import { requireMediator } from '../../../middleware/auth'
import { llmChat } from '../../../utils/llm'

// ============================================================
// 调解员智能对话 — 调用 deepseek-v4-flash 大模型
// 供调解员在案件详情页右下角对话框使用，回答调解相关问题
// ============================================================

function buildMediatorSystemPrompt(caseData: {
  id: string
  title: string
  description: string | null
  partyAName: string
  partyBName: string
  status?: string | null
  phase?: string | null
}, dynamicFile?: {
  partyAnalysis?: string | null
  timeline?: string | null
  disputeChecklist?: string | null
  positions?: string | null
} | null): string {
  const lines = [
    '你是一位专业的商事调解AI助手，正在协助调解员处理一个具体案件。',
    '你的职责：以中立、专业、严谨的态度协助调解员分析争议焦点、梳理法律依据、评估调解方案、起草调解话术与协议要点。',
    '回复要求：使用简洁、专业的中文，条理清晰；涉及法律问题时给出依据并说明理由；不确定时如实说明，不编造。',
    '',
    '## 当前案件上下文',
    `案件编号：${caseData.id}`,
    `案件名称：${caseData.title}`,
    `申请人（甲方）：${caseData.partyAName}`,
    `被申请人（乙方）：${caseData.partyBName}`,
  ]
  if (caseData.description) lines.push(`案件描述：${caseData.description}`)
  if (caseData.status) lines.push(`案件状态：${caseData.status}`)
  if (caseData.phase) lines.push(`当前阶段：${caseData.phase}`)
  if (dynamicFile) {
    lines.push('')
    lines.push('## 已知案件信息')
    if (dynamicFile.disputeChecklist) lines.push(`争议清单：${dynamicFile.disputeChecklist}`)
    if (dynamicFile.timeline) lines.push(`关键时间线：${dynamicFile.timeline}`)
    if (dynamicFile.partyAnalysis) lines.push(`当事人特征：${dynamicFile.partyAnalysis}`)
    if (dynamicFile.positions) lines.push(`各方立场：${dynamicFile.positions}`)
  }
  lines.push('')
  lines.push('请基于以上案件上下文回答调解员的问题。')
  return lines.join('\n')
}

export default defineEventHandler(async (event) => {
  requireMediator(event)

  const caseNumber = getRouterParam(event, 'caseNumber')
  const body = await readBody(event)

  if (!caseNumber || !body?.message || typeof body.message !== 'string') {
    throw createError({ statusCode: 400, message: '缺少必要参数' })
  }

  const db = getDb()
  const caseData = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 加载动态案件信息（争议清单/时间线/立场等）作为上下文
  let dynamicFile = null
  try {
    const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseNumber)).get()
    if (df) {
      dynamicFile = {
        partyAnalysis: df.partyAnalysis ?? null,
        timeline: df.timeline ?? null,
        disputeChecklist: df.disputeChecklist ?? null,
        positions: df.positions ?? null,
      }
    }
  } catch (err) {
    console.error('[MediatorChat] Failed to load dynamic file:', err)
  }

  const systemPrompt = buildMediatorSystemPrompt(caseData, dynamicFile)

  // 历史对话（由前端传入，role: user/assistant）
  const history = Array.isArray(body.history)
    ? body.history
        .filter((m: any) => m && typeof m.content === 'string')
        .slice(-20)
        .map((m: any) => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.content,
        }))
    : []

  try {
    const content = await llmChat({
      system: systemPrompt,
      prompt: body.message,
      history,
      temperature: 0.5,
      maxTokens: 1500,
    })
    return { success: true, data: { content } }
  } catch (err: any) {
    console.error('[MediatorChat] LLM call failed:', err?.message)
    throw createError({ statusCode: 500, message: err?.message || 'AI 服务调用失败，请稍后重试' })
  }
})