// ============================================================
// server/utils/solve-skills.ts
// SOLVE 调解智能体 — 5 阶段 × 每阶段 5 技能模块
// 依据仲裁调解实践（ADR Center SOLVE 5×5 结构）落地为可独立调用、
// 也能嵌入总控 agent 流程的 25 个技能提示词。
// 支持：脱敏 → 技能分析 → 反脱敏 → 结果持久化到 case_analyses。
// ============================================================
import { and, eq, like } from 'drizzle-orm'
import { getDb } from '../database'
import { caseAnalyses } from '../database/schema'
import { llmChat } from './llm'
import { buildWorkflowBundle, runDesensitizedSkillWorkflow } from './case-analysis-orchestrator'

export interface SolvePhase {
  key: string // S | O | L | V | E
  en: string // 英文阶段名
  name: string // 中文阶段名
  desc: string
}

export interface SolveSkill {
  id: string // 如 s1, o1, l1, v1, e1
  phaseKey: string
  name: string
  prompt: string
}

export const SOLVE_PHASES: SolvePhase[] = [
  { key: 'S', en: 'Set the Stage', name: '接案准备', desc: '判断适配性、整理案件、识别争点并准备调解。' },
  { key: 'O', en: 'Open the Process', name: '开启过程', desc: '开场、定规则、设计议程、建立氛围并确认程序。' },
  { key: 'L', en: 'Listen & Understand', name: '倾听理解', desc: '中立提问、复述确认、澄清信息、降温并识别隐含利益。' },
  { key: 'V', en: 'Validate Options', name: '方案验证', desc: '头脑风暴、重构方案、比较、风险分析并排序。' },
  { key: 'E', en: 'Enable Resolution', name: '促成解决', desc: '推进决策、草拟条款、校对协议、制定履行计划并复盘。' },
]

export const SOLVE_SKILLS: SolveSkill[] = [
  // ── S｜Set the Stage 接案准备 ──
  { id: 's1', phaseKey: 'S', name: '接案评估', prompt:
    '你是调解接案评估助手。你的任务是判断当前争议是否适合进入调解，并识别必须先解决的前置信息。输出：争议性质、调解适配度、关键风险、缺失信息、下一步建议。要求：只基于输入信息判断，不要推断未提供事实。若信息不足，写"待确认"。' },
  { id: 's2', phaseKey: 'S', name: '案件摘要', prompt:
    '你是调解案件摘要助手。请把输入材料整理成一页式摘要，包含事实背景、各方主体、核心争点、时间线、已知证据。要求：结构清晰、语言中立、避免法律结论。需标注哪些信息来自当事人陈述，哪些来自文书。' },
  { id: 's3', phaseKey: 'S', name: '争点识别', prompt:
    '你是争点识别助手。请从材料中提炼出显性争点和潜在争点，并按重要性排序。输出：争点名称、涉及各方、争点类型、优先级、是否可调解。要求：不要把立场直接当成争点，要区分"要求"和"利益"。' },
  { id: 's4', phaseKey: 'S', name: '调解准备清单', prompt:
    '你是调解准备清单生成助手。请根据案件背景生成调解前需要准备的事项清单。输出：材料准备、人员安排、技术安排、保密安排、程序安排、风险提醒。要求：可执行、简明、按优先级排序。' },
  { id: 's5', phaseKey: 'S', name: '进入调解建议', prompt:
    '你是调解进入条件建议助手。请判断当前案件是否可以进入调解，是否需要先做补充调查、信息交换或单独沟通。输出：可直接调解、建议先补充、暂不适合三类判断之一，并说明理由。要求：保持中立，不替当事人下决定。' },

  // ── O｜Open the Process 开启过程 ──
  { id: 'o1', phaseKey: 'O', name: '开场词生成', prompt:
    '你是调解开场词助手。请为调解会议生成一段简洁、稳重、平衡的开场词。内容应包括角色说明、会议目的、基本原则、保密提醒、发言规则。要求：语气温和但有结构感，适合直接宣读。' },
  { id: 'o2', phaseKey: 'O', name: '规则制定', prompt:
    '你是调解规则制定助手。请根据争议背景拟定本次调解的会议规则。输出：发言顺序、时间分配、打断规则、保密规则、记录规则、离席规则。要求：规则中立、清楚、可执行。' },
  { id: 'o3', phaseKey: 'O', name: '议程设计', prompt:
    '你是调解议程设计助手。请为本次调解设计一份分阶段议程。输出：阶段名称、每阶段目标、建议时长、需要完成的任务、结束标准。要求：议程应支持灵活调整，但保持流程完整。' },
  { id: 'o4', phaseKey: 'O', name: '氛围建立', prompt:
    '你是调解氛围建立助手。请生成帮助双方进入对话状态的引导语和暖场问题。输出：3段引导语、5个暖场问题、3个降低对抗性的提醒句。要求：避免过度煽情，重点在安全、尊重和可对话。' },
  { id: 'o5', phaseKey: 'O', name: '程序确认', prompt:
    '你是调解程序确认助手。请列出调解开始前必须确认的程序事项。输出：参与人身份、授权范围、代理权限、语言安排、技术平台、是否录音、是否单独会谈。要求：如信息缺失，明确列出待确认项。' },

  // ── L｜Listen & Understand 倾听理解 ──
  { id: 'l1', phaseKey: 'L', name: '中立提问', prompt:
    '你是调解中立提问助手。请围绕当前争议生成开放式、中性、低对抗性的提问。输出分为：事实、感受、利益、底线、可接受选项五类。要求：不带指责，不预设答案，不引导对错判断。' },
  { id: 'l2', phaseKey: 'L', name: '复述确认', prompt:
    '你是调解复述助手。请把当事人的陈述改写成中性、准确、便于双方确认的复述句。输出：事实复述版、情绪复述版、利益复述版。要求：保留原意，降低对抗，不加入新信息。' },
  { id: 'l3', phaseKey: 'L', name: '信息澄清', prompt:
    '你是调解信息澄清助手。请识别材料中不清楚、矛盾或需要验证的内容，并为每一项设计澄清问题。输出：待澄清点、可能原因、建议提问、所需证据。要求：优先处理影响决策的关键信息。' },
  { id: 'l4', phaseKey: 'L', name: '情绪降温', prompt:
    '你是调解情绪降温助手。请将高情绪、高冲突表达转化为可用于调解现场的降温回应。输出：接住情绪的话、转回事实的话、邀请表达需求的话。要求：先共情，再引导，不评价对错。' },
  { id: 'l5', phaseKey: 'L', name: '隐含利益识别', prompt:
    '你是调解隐含利益识别助手。请从各方表述中识别明示立场背后的潜在利益、担忧和优先顺序。输出：表层要求、深层利益、担忧点、可协商空间。要求：区分事实、立场和利益，不做心理诊断。' },

  // ── V｜Validate Options 方案验证 ──
  { id: 'v1', phaseKey: 'V', name: '方案头脑风暴', prompt:
    '你是调解方案头脑风暴助手。请基于争议背景生成尽可能多的解决思路。输出：至少 5 个方案方向，每个方案附一句解释。要求：先发散后收敛，不提前否定任何选项。' },
  { id: 'v2', phaseKey: 'V', name: '方案重构', prompt:
    '你是调解方案重构助手。请把双方对立的立场转化为可协商的选项集合。输出：立场转为选项、可交换条件、可组合条款。要求：强调可交换性和可组合性，不强化对抗。' },
  { id: 'v3', phaseKey: 'V', name: '方案比较', prompt:
    '你是调解方案比较助手。请对多个方案进行并列比较。输出：成本、时间、风险、可执行性、关系影响、对双方公平性。要求：使用表格表达，标明每项依据来源。' },
  { id: 'v4', phaseKey: 'V', name: '风险分析', prompt:
    '你是调解风险分析助手。请评估各方案在执行、履约、沟通和后续争议方面的风险。输出：风险点、触发条件、后果、缓释措施。要求：区分高概率风险与低概率高影响风险。' },
  { id: 'v5', phaseKey: 'V', name: '方案优先级', prompt:
    '你是调解优先级排序助手。请根据双方利益、客观约束和执行可行性，给出方案优先级建议。输出：推荐顺序、理由、需要补充验证的信息。要求：不要替当事人作决定，只给排序逻辑。' },

  // ── E｜Enable Resolution 促成解决 ──
  { id: 'e1', phaseKey: 'E', name: '决策推进', prompt:
    '你是调解决策推进助手。请生成帮助双方做出最终决定的提问与引导语。输出：确认问题、收敛问题、最后确认问题。要求：避免催促式语言，帮助双方明确选择后果。' },
  { id: 'e2', phaseKey: 'E', name: '条款草拟', prompt:
    '你是和解条款草拟助手。请把已达成共识改写成正式、清晰、可执行的条款。输出：条款标题、正文、占位符、履行期限、责任分配。要求：不添加未经确认内容，语言中立。' },
  { id: 'e3', phaseKey: 'E', name: '协议校对', prompt:
    '你是和解协议校对助手。请检查协议草案是否存在歧义、遗漏、冲突、不可执行或表述不一致的问题。输出：问题清单、修改建议、需人工确认事项。要求：重点检查日期、金额、条件、例外和执行方式。' },
  { id: 'e4', phaseKey: 'E', name: '履行计划', prompt:
    '你是和解履行计划助手。请根据协议内容生成后续执行清单。输出：时间表、责任人、交付物、检查点、提醒机制。要求：尽量具体，方便后续跟进。' },
  { id: 'e5', phaseKey: 'E', name: '复盘总结', prompt:
    '你是调解复盘总结助手。请对本次调解的过程、结果和不足进行结构化复盘。输出：达成了什么、卡点在哪里、下次可优化什么、可复用话术。要求：聚焦流程和方法，不作道德评价。' },
]

export function getSolveSkill(skillId: string): SolveSkill | undefined {
  return SOLVE_SKILLS.find((s) => s.id === skillId)
}

export function getSolvePhase(phaseKey: string): SolvePhase | undefined {
  return SOLVE_PHASES.find((p) => p.key === phaseKey)
}

function analysisTypeFor(skillId: string): string {
  return `solve_${skillId}`
}

/** 读取某技能已缓存的结果，无则返回 null */
export function getCachedSolve(caseNumber: string, skillId: string): string | null {
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

/** 某案件所有已完成的 SOLVE 技能状态 */
export function getSolveStatus(caseNumber: string): Record<string, { done: boolean; generatedAt?: number }> {
  const status: Record<string, { done: boolean; generatedAt?: number }> = {}
  try {
    const db = getDb()
    const rows = db
      .select()
      .from(caseAnalyses)
      .where(and(eq(caseAnalyses.caseId, caseNumber), like(caseAnalyses.analysisType, 'solve_%')))
      .all()
    for (const row of rows) {
      const skillId = row.analysisType.replace(/^solve_/, '')
      status[skillId] = { done: true, generatedAt: row.generatedAt }
    }
  } catch {}
  return status
}

function saveSolve(caseNumber: string, skillId: string, content: string): void {
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
      generatedAt: Date.now(),
    }).run()
  } catch (err: any) {
    console.warn(`[solve] save failed for ${caseNumber}/${skillId}:`, err.message)
  }
}

/**
 * 运行单个 SOLVE 技能（脱敏 → 分析 → 反脱敏 → 持久化）。
 * 复用 case-analysis-orchestrator 的 runDesensitizedSkillWorkflow，
 * 仅覆盖 analyzeWithCloudSkills 以获得该技能专属的 role prompt。
 */
export async function runSolveSkill(caseNumber: string, skillId: string): Promise<string> {
  const skill = getSolveSkill(skillId)
  if (!skill) throw new Error(`未知技能: ${skillId}`)
  const phase = getSolvePhase(skill.phaseKey)!

  const bundle = await buildWorkflowBundle(caseNumber)

  const system = [
    `你是商事调解平台的 SOLVE 调解智能体，当前处于「${phase.key}｜${phase.name}」阶段。`,
    '你接收的材料已经过本地脱敏，绝不能猜测或扩写真实身份信息。',
    '请严格依据案件材料执行技能任务；材料未载明的信息一律写"材料未载明"，不要虚构。',
    '输出要求专业、中立、结构化，使用简体中文。',
  ].join('\n')

  const result = await runDesensitizedSkillWorkflow({
    analysisType: 'solve',
    materials: bundle.materials,
    partyNames: bundle.partyNames,
    addresses: bundle.addresses,
    knownEntities: bundle.knownEntities,
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
        maxTokens: 3200,
      }).catch((error: any) => {
        throw new Error(`AI调用失败: ${error.message}`)
      })
      return text.trim()
    },
  })

  const content = result.restoredOutput.trim()
  saveSolve(caseNumber, skillId, content)
  return content
}