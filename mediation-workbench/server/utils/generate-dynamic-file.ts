// ============================================================
// server/utils/generate-dynamic-file.ts
// 分析案件材料，生成动态分析文件内容
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../database'
import { cases, caseDynamicFiles } from '../database/schema'
import { searchKb, formatKbResultsForPrompt } from './kb-search'

const ANALYSIS_PROMPT = `## 角色
你是一位商事调解专家，负责分析案件材料并提取关键信息。

## 任务
请分析以下案件材料，提取 6 个维度的信息。每个维度用 100-300 字概括。

## 输出格式（严格 JSON，不要包裹代码块，不要其他说明）
{
  "timeline": "按时间顺序列出关键事件，格式：日期 - 事件描述（每行一个）",
  "disputeChecklist": "列出所有争议点，格式：争议点名称 - 甲方立场 - 乙方立场 - 优先级（高/中/低）（每行一个）",
  "positions": "概括双方的核心立场和诉求，分甲方、乙方列出",
  "partyAnalysis": "分析双方当事人的特征：谈判风格、决策权限、情绪状态、合作意愿等",
  "potentialInterests": "识别双方潜在的共同利益和可交换利益点",
  "batna": "分析双方的最佳替代方案（BATNA）：如果调解失败，各自的最佳选择是什么"
}

## 严格要求
- 只输出 JSON，不要输出其他任何内容
- 如果某个维度信息不足无法分析，写"（信息不足，待补充）"
- 使用中文
`

/**
 * 为指定案件生成动态分析文件
 * @param caseNumber 案号
 * @param options.force 强制重新生成（覆盖已有数据）
 * @returns 生成的字段列表
 */
export async function generateDynamicFile(
  caseNumber: string,
  options: { force?: boolean } = {}
): Promise<{ generated: string[]; skipped: string[]; reason?: string }> {
  const db = getDb()
  const caseData = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
  if (!caseData) throw new Error(`案件 ${caseNumber} 不存在`)

  const existing = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseNumber)).get()

  // 检查哪些字段已有数据
  const fields = ['timeline', 'disputeChecklist', 'positions', 'partyAnalysis', 'potentialInterests', 'batna'] as const
  const emptyFields = fields.filter(f => {
    if (options.force) return true
    const val = existing?.[f]
    return !val || String(val).trim().length < 30
  })

  if (emptyFields.length === 0) {
    console.log(`[generate-df] ${caseNumber}: 所有字段已有数据，跳过`)
    return { generated: [], skipped: [...fields], reason: 'already_complete' }
  }

  // 构建分析材料
  const materials = [
    caseData.title && `【案件标题】${caseData.title}`,
    caseData.partyAName && caseData.partyBName && `【当事人】甲方：${caseData.partyAName}，乙方：${caseData.partyBName}`,
    caseData.description && `【案件描述】${caseData.description}`,
    caseData.claimsSummary && `【主张与答辩】${caseData.claimsSummary}`,
    caseData.evidenceSummary && `【证据与质证】${caseData.evidenceSummary}`,
  ].filter(Boolean).join('\n\n')

  if (materials.length < 50) {
    console.log(`[generate-df] ${caseNumber}: 材料不足，跳过`)
    return { generated: [], skipped: [...fields], reason: 'insufficient_materials' }
  }

  // RAG: 搜索相关法律条文
  let systemPrompt = ANALYSIS_PROMPT
  try {
    const searchQuery = `${caseData.title || ''} ${caseData.description || ''}`.slice(0, 200)
    const kbResults = await searchKb(searchQuery, 3)
    if (kbResults.length > 0) {
      systemPrompt += '\n\n## 参考法律条文\n' + formatKbResultsForPrompt(kbResults)
      console.log(`[generate-df] ${caseNumber}: RAG 注入 ${kbResults.length} 条结果`)
    }
  } catch {}

  // 调用 AI 分析
  const config = useRuntimeConfig()
  if (!config.openaiApiKey) throw new Error('未配置 AI API Key')

  const { generateText } = await import('ai')
  const { createOpenAI } = await import('@ai-sdk/openai')
  const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey: config.openaiApiKey }
  if (config.openaiBaseUrl) openaiOptions.baseURL = config.openaiBaseUrl
  const openai = createOpenAI(openaiOptions)

  console.log(`[generate-df] ${caseNumber}: 开始分析（需填充 ${emptyFields.length} 个字段）`)
  const result = await generateText({
    model: openai(config.openaiModel || 'gpt-4o-mini'),
    system: systemPrompt,
    prompt: materials,
    temperature: 0.3,
  })

  // 解析 JSON 结果
  let parsed: Record<string, string> = {}
  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/)
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    console.warn(`[generate-df] ${caseNumber}: JSON 解析失败`, err)
    throw new Error('AI 返回格式异常')
  }

  // 只更新需要填充的字段
  const updates: Record<string, string> = {}
  for (const f of emptyFields) {
    if (parsed[f] && String(parsed[f]).trim().length > 10) {
      updates[f] = String(parsed[f]).trim()
    }
  }

  if (Object.keys(updates).length === 0) {
    console.warn(`[generate-df] ${caseNumber}: AI 未返回有效数据`)
    return { generated: [], skipped: [...fields], reason: 'ai_empty' }
  }

  // 写入数据库
  const now = Date.now()
  if (existing) {
    db.update(caseDynamicFiles).set({ ...updates, updatedAt: now }).where(eq(caseDynamicFiles.caseId, caseNumber)).run()
  } else {
    db.insert(caseDynamicFiles).values({
      id: caseNumber,
      caseId: caseNumber,
      ...updates,
      createdAt: now,
      updatedAt: now,
      dialogEnded: false,
      dialogTurnCount: 0,
    }).run()
  }

  console.log(`[generate-df] ${caseNumber}: 已生成 ${Object.keys(updates).join(', ')}`)
  return { generated: Object.keys(updates), skipped: fields.filter(f => !updates[f]) }
}
