import { and, eq, like } from 'drizzle-orm'
import { getDb } from '../database'
import { caseAnalyses, caseDynamicFiles } from '../database/schema'
import { llmChat } from './llm'
import { buildWorkflowBundle, runDesensitizedSkillWorkflow } from './case-analysis-orchestrator'
import { searchKb } from './kb-search'
import { getCaseRules } from './desensitize-rules'
import { createAgentRun, finishAgentRun, appendAgentRunEval, EVAL_LOW_SCORE_THRESHOLD, EVAL_FLAG_HALLUCINATION } from './case-audit'

/**
 * 去除技能输出中的 Markdown 标记，转成纯文本。
 * 覆盖：标题(#)、加粗/斜体(双星号/双下划线/单星号)、行内代码、链接、列表符、表格、引用、
 *      水平分隔线、HTML 标签、多余空行。
 */
export function stripMarkdown(text: string, preserveTables = false): string {
  if (!text) return ''
  return text
    // HTML 标签
    .replace(/<[^>]*>/g, '')
    // 图片/链接：保留链接文字
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 标题符号
    .replace(/^#{1,6}\s*/gm, '')
    // 表格行：默认把 | 分隔符换成全角空格；preserveTables 时保留 Markdown 表格供前端渲染
    .replace(/^\s*\|.*\|\s*$/gm, (line) => {
      if (preserveTables) return line
      const cells = line.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim())
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return ''
      return cells.join('　')
    })
    // 列表符（- * + 数字. 复选框）
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.、]\s+/gm, '')
    .replace(/^\s*[-*+]\s*\[[ xX]\]\s*/gm, '')
    // 引用
    .replace(/^\s*>\s?/gm, '')
    // 粗体/斜体/行内代码
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*(?![^*])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    // 水平分隔线
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
    // 空行压缩
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 表格行清洗后的单元格连接符：全角空格（避免与 md 表格标记混淆且可读） */

export interface ValuePhase {
  key: string
  en: string
  name: string
  desc: string
}

/** 技能上下文配置规则：指定该技能分析所需的案件状态字段、先序阶段输出与附件策略。 */
export interface SkillContextConfig {
  /** 案件状态存储字段白名单（对应 buildWorkflowBundle 的 sections 键） */
  fields?: string[]
  /** 所需的前序阶段输出（阶段键列表，如 ['V','L']），配合相关性筛选 */
  priorPhases?: string[]
  /** 是否包含附件材料文本 */
  includeDocs?: boolean
  /** 是否需要知识库检索增强（RAG） */
  useRag?: boolean
}

export interface ValueSkill {
  id: string
  phaseKey: string
  name: string
  prompt: string
  /** 阶段内运行顺序（1-5），决定自动编排执行次序 */
  order: number
  /** 依赖的前序技能 id 列表；执行前校验，未完成则阻止/先自动补跑 */
  dependsOn: string[]
  /** 上下文配置规则；缺省时使用全量材料 + 相关性筛选 */
  context?: SkillContextConfig
}

/**
 * 技能元数据：阶段内运行顺序、依赖关系与上下文配置规则。
 * 依据 V→A→L→U→E 阶段内从"认识"到"决策"的流程逻辑确定。
 * 上下文配置说明：
 *   - fields: 案件状态存储字段白名单（title/partyNames/description/caseFacts/disputeMatters/claimsSummary/evidenceSummary/mediationDemands/demandsBasis）
 *   - priorPhases: 所需前序阶段输出（阶段键），配合 orchestrator 的相关性筛选
 *   - includeDocs: 是否包含附件材料
 *   - useRag: 是否需要知识库增强
 */
export const SKILL_METADATA: Record<string, Pick<ValueSkill, 'order' | 'dependsOn' | 'context'>> = {
  // ── V 接案准备：评估→摘要→争点→清单→进入建议 ──
  v1: { order: 1, dependsOn: [], context: { fields: ['title', 'partyNames', 'description', 'caseFacts', 'disputeMatters'], includeDocs: true } },
  v2: { order: 2, dependsOn: [], context: { includeDocs: true } },
  v3: { order: 3, dependsOn: ['v1'], context: { fields: ['caseFacts', 'disputeMatters', 'claimsSummary', 'evidenceSummary'], priorPhases: ['V'], includeDocs: true } },
  v4: { order: 4, dependsOn: ['v2', 'v3'], context: { fields: ['title', 'partyNames', 'caseFacts', 'disputeMatters'], priorPhases: ['V'] } },
  v5: { order: 5, dependsOn: ['v1', 'v3'], context: { fields: ['title', 'partyNames', 'description', 'caseFacts'], priorPhases: ['V'] } },
  // ── A 开启过程：开场→规则→议程→氛围→程序确认 ──
  a1: { order: 1, dependsOn: [], context: { fields: ['title', 'partyNames'], priorPhases: ['V'], useRag: true, includeDocs: false } },
  a2: { order: 2, dependsOn: ['a1'], context: { fields: ['title', 'partyNames', 'disputeMatters'], priorPhases: ['V'] } },
  a3: { order: 3, dependsOn: ['a2'], context: { fields: ['title', 'disputeMatters'], priorPhases: ['V', 'A'] } },
  a4: { order: 4, dependsOn: [], context: { fields: ['title', 'partyNames'], priorPhases: ['V'] } },
  a5: { order: 5, dependsOn: ['a1', 'a2'], context: { fields: ['title', 'partyNames'], priorPhases: ['V', 'A'] } },
  // ── L 倾听理解：提问→复述→澄清→降温→利益识别 ──
  l1: { order: 1, dependsOn: [], context: { fields: ['caseFacts', 'disputeMatters'], priorPhases: ['V'] } },
  l2: { order: 2, dependsOn: ['l1'], context: { fields: ['caseFacts', 'disputeMatters'], priorPhases: ['V', 'L'] } },
  l3: { order: 3, dependsOn: ['l2'], context: { fields: ['caseFacts', 'disputeMatters', 'evidenceSummary'], priorPhases: ['V', 'L'] } },
  l4: { order: 4, dependsOn: [], context: { fields: ['caseFacts', 'disputeMatters'], priorPhases: ['L'] } },
  l5: { order: 5, dependsOn: ['l1', 'l3'], context: { fields: ['caseFacts', 'disputeMatters', 'claimsSummary'], priorPhases: ['V', 'L'], includeDocs: true } },
  // ── U 方案验证：发散→重构→比较→风险→优先级 ──
  u1: { order: 1, dependsOn: [], context: { fields: ['caseFacts', 'disputeMatters', 'mediationDemands'], priorPhases: ['L'] } },
  u2: { order: 2, dependsOn: ['u1'], context: { fields: ['disputeMatters', 'mediationDemands'], priorPhases: ['L', 'U'] } },
  u3: { order: 3, dependsOn: ['u2'], context: { priorPhases: ['L', 'U'] } },
  u4: { order: 4, dependsOn: ['u3'], context: { priorPhases: ['L', 'U'] } },
  u5: { order: 5, dependsOn: ['u3', 'u4'], context: { priorPhases: ['L', 'U'] } },
  // ── E 促成解决：推进→条款→校对→履行→复盘 ──
  e1: { order: 1, dependsOn: [], context: { fields: ['mediationDemands', 'demandsBasis'], priorPhases: ['U'] } },
  e2: { order: 2, dependsOn: ['e1'], context: { fields: ['mediationDemands', 'demandsBasis'], priorPhases: ['U'] } },
  e3: { order: 3, dependsOn: ['e2'], context: { priorPhases: ['U', 'E'] } },
  e4: { order: 4, dependsOn: ['e3'], context: { priorPhases: ['U', 'E'] } },
  e5: { order: 5, dependsOn: ['e3', 'e4'], context: { priorPhases: ['U', 'E'] } },
}

/** 合并技能定义与元数据，返回带顺序/依赖/上下文配置的完整技能。 */
export function getValueSkillsWithMeta(): ValueSkill[] {
  return VALUE_SKILLS.map((s) => {
    const meta = SKILL_METADATA[s.id]
    return meta ? { ...s, ...meta } : { ...s, order: 0, dependsOn: [] }
  })
}

/** 返回按阶段+阶段内顺序排列的全部技能（自动编排默认执行顺序）。 */
export function getOrderedValueSkills(): ValueSkill[] {
  return getValueSkillsWithMeta().sort((a, b) => {
    const p = (VALUE_PHASE_ORDER[a.phaseKey] ?? 99) - (VALUE_PHASE_ORDER[b.phaseKey] ?? 99)
    return p !== 0 ? p : (a.order ?? 0) - (b.order ?? 0)
  })
}

export const VALUE_PHASES: ValuePhase[] = [
  { key: 'V', en: 'Verify the Case', name: '接案准备', desc: '判断适配性、整理案件、识别争点并准备调解。' },
  { key: 'A', en: 'Activate the Process', name: '开启过程', desc: '开场、定规则、设计议程、建立氛围并确认程序。' },
  { key: 'L', en: 'Listen', name: '倾听理解', desc: '中立提问、复述确认、澄清信息、降温并识别隐含利益。' },
  { key: 'U', en: 'Unify the Options', name: '方案验证', desc: '头脑风暴、重构方案、比较、风险分析并排序。' },
  { key: 'E', en: 'Execute the Resolution', name: '促成解决', desc: '推进决策、草拟条款、校对协议、制定履行计划并复盘。' },
]

export const VALUE_SKILLS: ValueSkill[] = [
  { id: 'v1', phaseKey: 'V', name: '接案评估', prompt: '你是调解接案评估助手。你的任务是判断当前争议是否适合进入调解，并识别必须先解决的前置信息。输出：争议性质、调解适配度、关键风险、缺失信息、下一步建议。要求：只基于输入信息判断，不要推断未提供事实。若信息不足，写"待确认"。其中"关键风险"与"缺失信息"请用 Markdown 表格呈现，列为：项目|说明。' },
  { id: 'v2', phaseKey: 'V', name: '案件摘要', prompt: '你是调解案件摘要助手。请把输入材料整理成一页式摘要，包含事实背景、各方主体、核心争点、时间线、已知证据。要求：结构清晰、语言中立、避免法律结论。需标注哪些信息来自当事人陈述，哪些来自文书。"各方主体"请用 Markdown 表格呈现，列为：角色|信息|信息来源；"时间线"请用 Markdown 表格呈现，列为：时间|事件|信息来源；"已知证据"请用 Markdown 表格呈现，列为：序号|证据名称|内容要点|来源/性质。' },
  { id: 'v3', phaseKey: 'V', name: '争点识别', prompt: '你是争点识别助手。请从材料中提炼出显性争点和潜在争点，并按重要性排序。输出：争点名称、涉及各方、争点类型、优先级、是否可调解。要求：不要把立场直接当成争点，要区分"要求"和"利益"。全部争点请用 Markdown 表格呈现，列为：序号|争点名称|涉及各方|争点类型|优先级|是否可调解。' },
  { id: 'v4', phaseKey: 'V', name: '调解准备清单', prompt: '你是调解准备清单生成助手。请根据案件背景生成调解前需要准备的事项清单。输出：材料准备、人员安排、技术安排、保密安排、程序安排、风险提醒。要求：可执行、简明、按优先级排序。请用 Markdown 表格呈现，列为：类别|事项|优先级|备注。' },
  { id: 'v5', phaseKey: 'V', name: '进入调解建议', prompt: '你是调解进入条件建议助手。请判断当前案件是否可以进入调解，是否需要先做补充调查、信息交换或单独沟通。输出：可直接调解、建议先补充、暂不适合三类判断之一，并说明理由。要求：保持中立，不替当事人下决定。理由请用 Markdown 表格呈现，列为：判断维度|结论|说明。' },
  { id: 'a1', phaseKey: 'A', name: '开场词生成', prompt: '你是调解开场词助手。请为调解会议生成一段简洁、稳重、平衡的开场词。内容应包括角色说明、会议目的、基本原则、保密提醒、发言规则。要求：语气温和但有结构感，适合直接宣读。' },
  { id: 'a2', phaseKey: 'A', name: '规则制定', prompt: '你是调解规则制定助手。请根据争议背景拟定本次调解的会议规则。输出：发言顺序、时间分配、打断规则、保密规则、记录规则、离席规则。要求：规则中立、清楚、可执行。请用 Markdown 表格呈现，列为：规则类别|具体规则|说明/例外。' },
  { id: 'a3', phaseKey: 'A', name: '议程设计', prompt: '你是调解议程设计助手。请为本次调解设计一份分阶段议程。输出：阶段名称、每阶段目标、建议时长、需要完成的任务、结束标准。要求：议程应支持灵活调整，但保持流程完整。请用 Markdown 表格呈现，列为：阶段|目标|建议时长|主要任务|结束标准。' },
  { id: 'a4', phaseKey: 'A', name: '氛围建立', prompt: '你是调解氛围建立助手。请生成帮助双方进入对话状态的引导语和暖场问题。输出：3段引导语、5个暖场问题、3个降低对抗性的提醒句。要求：避免过度煽情，重点在安全、尊重和可对话。' },
  { id: 'a5', phaseKey: 'A', name: '程序确认', prompt: '你是调解程序确认助手。请列出调解开始前必须确认的程序事项。输出：参与人身份、授权范围、代理权限、语言安排、技术平台、是否录音、是否单独会谈。要求：如信息缺失，明确列出待确认项。请用 Markdown 表格呈现，列为：确认项|当前状态|需补充/确认内容。' },
  { id: 'l1', phaseKey: 'L', name: '中立提问', prompt: '你是调解中立提问助手。请围绕当前争议生成开放式、中性、低对抗性的提问。输出分为：事实、感受、利益、底线、可接受选项五类。要求：不带指责，不预设答案，不引导对错判断。请用 Markdown 表格呈现，列为：类别|提问|提问目的/注意事项。' },
  { id: 'l2', phaseKey: 'L', name: '复述确认', prompt: '你是调解复述助手。请把当事人的陈述改写成中性、准确、便于双方确认的复述句。输出：事实复述版、情绪复述版、利益复述版。要求：保留原意，降低对抗，不加入新信息。' },
  { id: 'l3', phaseKey: 'L', name: '信息澄清', prompt: '你是调解信息澄清助手。请识别材料中不清楚、矛盾或需要验证的内容，并为每一项设计澄清问题。输出：待澄清点、可能原因、建议提问、所需证据。要求：优先处理影响决策的关键信息。请用 Markdown 表格呈现，列为：待澄清点|可能原因|建议提问|所需证据。' },
  { id: 'l4', phaseKey: 'L', name: '情绪降温', prompt: '你是调解情绪降温助手。请将高情绪、高冲突表达转化为可用于调解现场的降温回应。输出：接住情绪的话、转回事实的话、邀请表达需求的话。要求：先共情，再引导，不评价对错。' },
  { id: 'l5', phaseKey: 'L', name: '隐含利益识别', prompt: '你是调解隐含利益识别助手。请从各方表述中识别明示立场背后的潜在利益、担忧和优先顺序。输出：表层要求、深层利益、担忧点、可协商空间。要求：区分事实、立场和利益，不做心理诊断。请用 Markdown 表格呈现，列为：主体|表层要求|深层利益|担忧点|可协商空间。' },
  { id: 'u1', phaseKey: 'U', name: '方案头脑风暴', prompt: '你是调解方案头脑风暴助手。请基于争议背景生成尽可能多的解决思路。输出：至少 5 个方案方向，每个方案附一句解释。要求：先发散后收敛，不提前否定任何选项。' },
  { id: 'u2', phaseKey: 'U', name: '方案重构', prompt: '你是调解方案重构助手。请把双方对立的立场转化为可协商的选项集合。输出：立场转为选项、可交换条件、可组合条款。要求：强调可交换性和可组合性，不强化对抗。' },
  { id: 'u3', phaseKey: 'U', name: '方案比较', prompt: '你是调解方案比较助手。请对多个方案进行并列比较。输出：成本、时间、风险、可执行性、关系影响、对双方公平性。要求：使用 Markdown 表格表达（列为：方案|成本|时间|风险|可执行性|关系影响|对双方公平性），标明每项依据来源。' },
  { id: 'u4', phaseKey: 'U', name: '风险分析', prompt: '你是调解风险分析助手。请评估各方案在执行、履约、沟通和后续争议方面的风险。输出：风险点、触发条件、后果、缓释措施。要求：区分高概率风险与低概率高影响风险。请用 Markdown 表格呈现，列为：风险点|风险等级|触发条件|后果|缓释措施。' },
  { id: 'u5', phaseKey: 'U', name: '方案优先级', prompt: '你是调解优先级排序助手。请根据双方利益、客观约束和执行可行性，给出方案优先级建议。输出：推荐顺序、理由、需要补充验证的信息。要求：不要替当事人作决定，只给排序逻辑。请用 Markdown 表格呈现，列为：优先级|方案|推荐理由|需补充验证信息。' },
  { id: 'e1', phaseKey: 'E', name: '决策推进', prompt: '你是调解决策推进助手。请生成帮助双方做出最终决定的提问与引导语。输出：确认问题、收敛问题、最后确认问题。要求：避免催促式语言，帮助双方明确选择后果。' },
  { id: 'e2', phaseKey: 'E', name: '条款草拟', prompt: '你是和解条款草拟助手。请把已达成共识改写成正式、清晰、可执行的条款。输出：条款标题、正文、占位符、履行期限、责任分配。要求：不添加未经确认内容，语言中立。条款清单请用 Markdown 表格呈现，列为：条款标题|正文要点|占位符/待确认|履行期限|责任分配。' },
  { id: 'e3', phaseKey: 'E', name: '协议校对', prompt: '你是和解协议校对助手。请检查协议草案是否存在歧义、遗漏、冲突、不可执行或表述不一致的问题。输出：问题清单、修改建议、需人工确认事项。要求：重点检查日期、金额、条件、例外和执行方式。请用 Markdown 表格呈现，列为：问题类型|问题描述|修改建议|是否需人工确认。' },
  { id: 'e4', phaseKey: 'E', name: '履行计划', prompt: '你是和解履行计划助手。请根据协议内容生成后续执行清单。输出：时间表、责任人、交付物、检查点、提醒机制。要求：尽量具体，方便后续跟进。请用 Markdown 表格呈现，列为：时间/期限|责任方|行动事项|交付物|检查点/提醒。' },
  { id: 'e5', phaseKey: 'E', name: '复盘总结', prompt: '你是调解复盘总结助手。请对本次调解的过程、结果和不足进行结构化复盘。输出：达成了什么、卡点在哪里、下次可优化什么、可复用话术。要求：聚焦流程和方法，不作道德评价。"复盘要点"请用 Markdown 表格呈现，列为：维度|复盘结论|可复用经验/下一步建议。' },
]

const INITIAL_VALUE_SKILL_IDS = ['v2', 'v3', 'l5', 'u4', 'v4'] as const

/** 阶段流程顺序（与 orchestrator 的 VALUE_PHASE_ORDER 保持一致） */
export const VALUE_PHASE_ORDER: Record<string, number> = { V: 0, A: 1, L: 2, U: 3, E: 4 }

type ValueSkillRunner = (caseNumber: string, skillId: string) => Promise<string>

interface InitialValuePipelineDeps {
  runSkill?: ValueSkillRunner
  now?: () => number
}

export function getValueSkill(skillId: string): ValueSkill | undefined {
  return VALUE_SKILLS.find((s) => s.id === skillId)
}

export function getValuePhase(phaseKey: string): ValuePhase | undefined {
  return VALUE_PHASES.find((p) => p.key === phaseKey)
}

function analysisTypeFor(skillId: string): string {
  return `value_${skillId}`
}

export function getCachedValue(caseNumber: string, skillId: string): string | null {
  try {
    const db = getDb()
    const row = db
      .select()
      .from(caseAnalyses)
      .where(and(eq(caseAnalyses.caseId, caseNumber), eq(caseAnalyses.analysisType, analysisTypeFor(skillId))))
      .get()
    return row?.content || null
  } catch {
    return null
  }
}

export function getValueStatus(caseNumber: string): Record<string, { done: boolean; generatedAt?: number }> {
  const status: Record<string, { done: boolean; generatedAt?: number }> = {}
  try {
    const db = getDb()
    const rows = db
      .select()
      .from(caseAnalyses)
      .where(and(eq(caseAnalyses.caseId, caseNumber), like(caseAnalyses.analysisType, 'value_%')))
      .all()
    for (const row of rows) {
      const skillId = row.analysisType.replace(/^value_/, '')
      status[skillId] = { done: true, generatedAt: row.generatedAt }
    }
  } catch {}
  return status
}

function saveValue(caseNumber: string, skillId: string, content: string, now = Date.now()): void {
  try {
    const db = getDb()
    db.delete(caseAnalyses)
      .where(and(eq(caseAnalyses.caseId, caseNumber), eq(caseAnalyses.analysisType, analysisTypeFor(skillId))))
      .run()
    db.insert(caseAnalyses).values({
      id: crypto.randomUUID(),
      caseId: caseNumber,
      analysisType: analysisTypeFor(skillId),
      content,
      generatedAt: now,
    }).run()
  } catch (err: any) {
    console.warn(`[value] save failed for ${caseNumber}/${skillId}:`, err.message)
  }
}

export async function runValueSkill(caseNumber: string, skillId: string, opts: { awaitEval?: boolean; skipDependencyCheck?: boolean } = {}): Promise<string> {
  const skill = getValueSkillsWithMeta().find((s) => s.id === skillId)
  if (!skill) throw new Error(`未知技能: ${skillId}`)
  const phase = getValuePhase(skill.phaseKey)
  if (!phase) throw new Error(`未知阶段: ${skill.phaseKey}`)

  // ── 依赖校验：所依赖的前序技能未完成时自动补跑（若依赖执行失败则阻止）──
  if (!opts.skipDependencyCheck && skill.dependsOn?.length) {
    for (const depId of skill.dependsOn) {
      const depDone = getCachedValue(caseNumber, depId)
      if (depDone) continue
      // 依赖未完成：自动编排先执行依赖（自动编排为默认执行方式）
      console.log(`[value] ${skillId} 依赖 ${depId} 未完成，自动补跑`)
      await runValueSkill(caseNumber, depId, { ...opts, skipDependencyCheck: false })
    }
  }

  const bundle = await buildWorkflowBundle(caseNumber, {
    currentSkillId: skillId,
    context: skill.context,
  })
  const rules = getCaseRules(caseNumber)

  const system = [
    `你是商事调解平台的 VALUE 调解智能体，当前处于「${phase.key}｜${phase.name}」阶段。`,
    '你接收的材料已经过本地脱敏，绝不能猜测或扩写真实身份信息。',
    '请严格依据案件材料执行技能任务；材料未载明的信息一律写"材料未载明"，不要虚构。',
    '输出要求专业、中立、结构化，使用简体中文。',
  ].join('\n')

  const result = await runDesensitizedSkillWorkflow({
    analysisType: 'value',
    materials: bundle.materials,
    partyNames: bundle.partyNames,
    addresses: bundle.addresses,
    knownEntities: bundle.knownEntities,
    rules,
    system,
    analyzeWithCloudSkills: async (input) => {
      const userPrompt = [
        '## 技能任务',
        skill.prompt,
        '',
        '## 脱敏案件材料',
        input.maskedMaterials,
        '',
        '请按技能任务要求输出。',
      ].join('\n')
      const text = await llmChat({
        system: input.system,
        prompt: userPrompt,
        temperature: 0.4,
        // DeepSeek 的 max_tokens 同时覆盖 reasoning + content；
        // reasoning 会消耗大量配额，给足输出空间避免内容截断
        maxTokens: 8000,
        // 长材料 + 长输出，给足时间（默认 125s 在 10K 字符输入下可能超时）
        timeoutMs: 300_000,
      }).catch((error: any) => {
        throw new Error(`AI调用失败: ${error.message}`)
      })
      return text.trim()
    },
  })

  // 存储为纯文本（去除 Markdown 标记，界面直接显示文字）
  const content = stripMarkdown(result.restoredOutput.trim(), true)
  const now = Date.now()
  saveValue(caseNumber, skillId, content, now)

  // 代理执行留痕（可回放）
  const runId = createAgentRun({
    caseId: caseNumber,
    agentType: 'value_skill',
    planJson: { skillId, phaseKey: phase.key, phaseName: phase.name },
    inputContext: `技能「${skill.name}」@${phase.key}阶段`,
    timeoutMs: 300_000,
  })

  // 引用溯源：技能执行前检索知识库，记录来源（供前端展示与审计）
  let retrievalRefs: unknown[] = []
  try {
    const kbResults = await searchKb(
      `${skill.name} ${bundle.caseData?.title || ''} ${bundle.caseData?.description || ''}`.slice(0, 200),
      3,
    )
    retrievalRefs = kbResults.map((r) => ({ path: r.path, score: r.score }))
  } catch {
    retrievalRefs = []
  }

  if (runId) {
    // 先完成技能执行记录（不含 eval，技能结果立即可用）
    finishAgentRun({
      runId,
      status: 'done',
      outputContent: content,
      retrievalRefs,
      reviewState: 'none',
      toolCalls: [{ name: 'run_desensitized_skill_workflow', at: now }],
    })
  }

  // 评估闭环（异步 fire-and-forget，不阻塞技能返回；awaitEval=true 时同步等待）
  const runEvalJudgement = async () => {
    try {
      const { getSamplesFor } = await import('../eval/dataset')
      const { judgeOutput } = await import('../eval/judge')
      const sample = getSamplesFor(skillId)[0]
      const rubric = (await import('../eval/dataset')).getRubricFor(skillId)
      if (!sample || !rubric || !runId) return
      const jr = await judgeOutput({
        sample,
        rubric,
        output: content.slice(0, 1200),
        materials: bundle.materials.slice(0, 1500),
        runtimeMode: true,
      })
      const evalResult = {
        normalized: jr.normalized,
        totalScore: jr.totalScore,
        maxTotal: jr.maxTotal,
        hallucinationCount: jr.hallucinations.length,
        hallucinations: jr.hallucinations,
        missingPoints: jr.missingPoints,
        evaluated: jr.evaluated,
      }
      const needsReview = jr.evaluated
        && (jr.normalized < EVAL_LOW_SCORE_THRESHOLD || (EVAL_FLAG_HALLUCINATION && jr.hallucinations.length > 0))
      appendAgentRunEval({
        runId,
        evalRecord: { name: 'eval_llm_judge', at: Date.now(), result: evalResult },
        reviewState: needsReview ? 'rejected' : 'approved',
      })
    } catch (err) {
      console.warn(`[value] eval failed for ${caseNumber}/${skillId}:`, err)
    }
  }

  if (opts.awaitEval) {
    await runEvalJudgement()
  } else {
    // fire-and-forget：技能结果立即返回，评分后台更新
    setTimeout(() => {
      console.log(`[value] async eval started for ${caseNumber}/${skillId}`)
      runEvalJudgement().catch((err) => console.warn(`[value] async eval failed ${caseNumber}/${skillId}:`, err))
    }, 0)
  }

  return content
}

export interface PipelineRunResult {
  run: string[]
  skipped: string[]
  failed: Array<{ skillId: string; error: string }>
  total: number
  /** 阶段暂停点：每阶段出口技能后等待人工确认；null 表示流程已跑完或无需暂停 */
  pauseAtPhase?: string | null
}

interface PipelineState {
  /** 当前运行阶段 */
  currentPhase: string
  /** 已完成（含跳过）的技能 */
  completed: string[]
  /** 失败技能 */
  failed: Array<{ skillId: string; error: string }>
  /** 运行状态: running | paused | done | cancelled */
  status: string
  /** 下次继续运行的起点阶段 */
  resumePhase: string
}

const PIPELINE_TABLE = 'case_task_runs'

function getPipelineState(caseNumber: string): PipelineState | null {
  try {
    const db = getDb()
    const sqlite = (db as any).$client as any
    const row = sqlite.prepare(
      `SELECT plan_json, output_content FROM ${PIPELINE_TABLE}
       WHERE case_id = ? AND agent_type = 'value_pipeline' ORDER BY rowid DESC LIMIT 1`,
    ).get(caseNumber)
    if (!row?.plan_json) return null
    return JSON.parse(row.plan_json) as PipelineState
  } catch { return null }
}

function savePipelineState(caseNumber: string, state: PipelineState): void {
  try {
    const db = getDb()
    const sqlite = (db as any).$client as any
    sqlite.prepare(
      `INSERT INTO ${PIPELINE_TABLE} (id, case_id, tenant_id, agent_type, status, plan_json, output_content, created_at)
       VALUES (?, ?, ?, 'value_pipeline', ?, ?, ?, ?)`,
    ).run(
      `pipe_${caseNumber}_${Date.now()}`,
      caseNumber,
      'tenant-default',
      state.status,
      JSON.stringify(state),
      JSON.stringify(state.completed),
      Date.now(),
    )
  } catch (err: any) {
    console.warn(`[value-pipeline] 状态保存失败:`, err?.message || err)
  }
}

/**
 * 自动编排（默认执行方式）：按 V→A→L→U→E 阶段及阶段内预设顺序依次运行全部技能。
 * - 依赖校验：目标技能依赖未完成时自动补跑；执行失败记录但不中断整链。
 * - 已完成技能默认跳过（force 强制重跑全部）。
 * - phaseByPhase=true：每阶段出口技能后暂停（awaitConfirm），返回 pauseAtPhase 等待人工确认。
 * - 恢复：fromPhase 指定从某阶段继续（跳过更早阶段）。
 */
export async function runValuePipelineAuto(
  caseNumber: string,
  opts: { force?: boolean; fromPhase?: string; phaseByPhase?: boolean } = {},
): Promise<PipelineRunResult> {
  const ordered = getOrderedValueSkills()
  const result: PipelineRunResult = { run: [], skipped: [], failed: [], total: ordered.length, pauseAtPhase: null }

  // 恢复运行：基于上次暂停状态继续
  const prev = !opts.force ? getPipelineState(caseNumber) : null
  const startPhase = opts.fromPhase || prev?.resumePhase
  const resumeCompleted = new Set(prev?.completed || [])

  for (const skill of ordered) {
    // 阶段起点：从指定阶段开始（含该阶段）
    if (startPhase && VALUE_PHASE_ORDER[skill.phaseKey] < VALUE_PHASE_ORDER[startPhase]) continue
    // 恢复时已完成的技能跳过
    if (resumeCompleted.has(skill.id)) { result.skipped.push(skill.id); continue }

    const cached = getCachedValue(caseNumber, skill.id)
    if (cached && !opts.force && !resumeCompleted.has(skill.id)) {
      result.skipped.push(skill.id)
      resumeCompleted.add(skill.id)
      continue
    }
    try {
      await runValueSkill(caseNumber, skill.id, { skipDependencyCheck: opts.force })
      result.run.push(skill.id)
      resumeCompleted.add(skill.id)
    } catch (err: any) {
      result.failed.push({ skillId: skill.id, error: err?.message || String(err) })
      resumeCompleted.add(skill.id) // 记录已尝试，避免无限重试
      console.warn(`[value-pipeline] ${skill.id} 执行失败:`, err?.message || err)
    }

    // ── 阶段暂停点：阶段内最后一个技能完成后，若启用 phaseByPhase 则暂停等待人工确认 ──
    const isPhaseExit = VALUE_PHASE_ORDER[skill.phaseKey] !== undefined
      && !ordered.some(s => s.phaseKey === skill.phaseKey && (s.order ?? 0) > (skill.order ?? 0))
    if (isPhaseExit && opts.phaseByPhase) {
      const nextPhase = Object.entries(VALUE_PHASE_ORDER)
        .sort((a, b) => a[1] - b[1])
        .find(([, order]) => order > VALUE_PHASE_ORDER[skill.phaseKey])?.[0]
      result.pauseAtPhase = skill.phaseKey
      // 保存暂停状态：下次从下一阶段恢复
      savePipelineState(caseNumber, {
        currentPhase: skill.phaseKey,
        completed: [...resumeCompleted],
        failed: result.failed,
        status: 'paused',
        resumePhase: nextPhase || '',
      })
      break
    }
  }

  // 全部跑完：记录完成状态
  if (result.pauseAtPhase === null) {
    savePipelineState(caseNumber, {
      currentPhase: 'E',
      completed: [...resumeCompleted],
      failed: result.failed,
      status: 'done',
      resumePhase: '',
    })
  }
  return result
}

/** 获取案件当前的自动编排状态（供前端恢复/展示）。 */
export function getPipelineStatus(caseNumber: string): { status: string; currentPhase: string; completed: string[]; failed: PipelineRunResult['failed'] } | null {
  const state = getPipelineState(caseNumber)
  if (!state) return null
  return { status: state.status, currentPhase: state.currentPhase, completed: state.completed, failed: state.failed }
}

/** 取消自动编排：标记为 cancelled（下次自动分析将重新开始，但仍跳过已完成技能）。 */
export function cancelValuePipeline(caseNumber: string): void {
  const state = getPipelineState(caseNumber)
  if (state) {
    state.status = 'cancelled'
    savePipelineState(caseNumber, state)
  }
}

export async function runInitialValuePipeline(caseNumber: string, deps: InitialValuePipelineDeps = {}) {
  const now = deps.now || Date.now
  const runner = deps.runSkill || runValueSkill
  const outputs: Record<string, string> = {}

  for (const skillId of INITIAL_VALUE_SKILL_IDS) {
    const content = (await runner(caseNumber, skillId)).trim()
    outputs[skillId] = content
    saveValue(caseNumber, skillId, content, now())
  }

  return {
    caseId: caseNumber,
    skillIds: [...INITIAL_VALUE_SKILL_IDS],
    outputs,
  }
}

export { INITIAL_VALUE_SKILL_IDS }
