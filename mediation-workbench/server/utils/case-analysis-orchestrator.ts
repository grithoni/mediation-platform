import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, like } from 'drizzle-orm'
import { getDb } from '../database'
import { persistDesensitization } from './desensitization-store'
import { extractDocumentText } from './file-extraction'
import {
  caseAnalyses,
  caseApplications,
  caseDynamicFiles,
  cases,
  documents,
} from '../database/schema'
import { formatKbResultsForPrompt, searchKb } from './kb-search'
import { llmChat } from './llm'
import { getCaseRules, rulesIndex, type DesensitizeRule } from './desensitize-rules'

export type WorkflowAnalysisType =
  | 'dynamic_file'
  | 'claim_basis'
  | 'anticipate_defense'
  | 'evidence_checklist'
  | 'recommend_solution'
  | 'evaluation'
  | 'value'

export interface SkillCatalogEntry {
  id: string
  name: string
  description: string
  prompt?: string
  source: 'uploaded' | 'builtin'
}

export interface DesensitizedPayload {
  maskedText: string
  /** 由调用方持久化后赋予；desensitizeCaseMaterials 本身不合成 */
  traceId?: string
  mapping: Record<string, string>
}

interface KnownEntity {
  value: string
  category: string
}

interface RuntimeDeps {
  desensitize?: (materials: string) => Promise<DesensitizedPayload>
  analyzeWithCloudSkills?: (input: {
    analysisType: WorkflowAnalysisType
    maskedMaterials: string
    skillPrompt: string
    prompt: string
    system: string
  }) => Promise<string>
  restore?: (input: {
    traceId: string
    text: string
    mapping: Record<string, string>
  }) => Promise<string>
}

interface WorkflowRunOptions extends RuntimeDeps {
  analysisType: WorkflowAnalysisType
  materials: string
  partyNames: string[]
  addresses: string[]
  knownEntities?: KnownEntity[]
  skillCatalog?: SkillCatalogEntry[]
  prompt?: string
  system?: string
  /** 脱敏规则复核（按案件由调解员配置）；缺省按默认规则。 */
  rules?: DesensitizeRule[]
}

interface WorkflowBundle {
  caseData: any
  application: any
  dynamicFile: any
  docs: Array<{ originalName: string; text: string }>
  priorAnalyses: Partial<Record<Exclude<WorkflowAnalysisType, 'dynamic_file'>, string>>
  valueResults: Array<{ skillId: string; content: string }> // 本案件已完成的 VALUE 技能结果（用于阶段间上下文串联）
  materials: string
  partyNames: string[]
  addresses: string[]
  knownEntities: KnownEntity[]
}

const BUILTIN_SKILLS: SkillCatalogEntry[] = [
  {
    id: 'builtin-timeline',
    name: '事实时间线',
    description: '提取关键时间节点、履约过程和争议演变顺序。',
    prompt: '优先识别明确日期、付款节点、催告节点、违约节点和证据来源。',
    source: 'builtin',
  },
  {
    id: 'builtin-disputes',
    name: '争议焦点',
    description: '拆分双方争议点并标记优先级。',
    prompt: '每个争议点写清甲方立场、乙方立场、证据支撑和处理优先级。',
    source: 'builtin',
  },
  {
    id: 'builtin-interests',
    name: '立场利益分析',
    description: '区分立场、真实利益、情绪和可交换条件。',
    prompt: '不要只复述主张，需识别潜在利益、谈判边界和合作意愿。',
    source: 'builtin',
  },
  {
    id: 'builtin-batna',
    name: 'BATNA评估',
    description: '评估调解失败后的最佳替代方案与最坏情形。',
    prompt: '结合诉讼、仲裁、执行、商誉和业务成本分析 BATNA/WATNA。',
    source: 'builtin',
  },
  {
    id: 'builtin-evidence',
    name: '证据核验',
    description: '检查证据链完整性、证明目的和补强建议。',
    prompt: '围绕待证事实、证据原件、形成过程、关联性、合法性给出清单。',
    source: 'builtin',
  },
]

const PII_PATTERNS: Array<{ category: string; pattern: RegExp }> = [
  { category: '证件', pattern: /\b\d{17}[\dXx]\b/g },
  { category: '电话', pattern: /\b1[3-9]\d{9}\b/g },
  { category: '邮箱', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { category: '银行卡', pattern: /\b62\d{14,17}\b/g },
  { category: '信用代码', pattern: /\b[0-9A-HJ-NPQRTUWXY]{18}\b/g },
  // 参照「文档脱敏助手」SKILL.md 规则表补充的类别：
  { category: '金额', pattern: /(?:人民币|RMB|¥|￥)?\s*\d[\d,]*\.?\d*\s*(?:万元|亿元|元)/g },
  { category: '日期', pattern: /\d{4}年\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2}/g },
  { category: '案号', pattern: /[（(]\d{4}[）)][^（()）\s]{1,20}号/g },
]

const ROLE_NAME_PATTERN = /(原告|被告|申请人|被申请人|上诉人|被上诉人|甲方|乙方|委托代理人|法定代表人|第三人|当事人)\s*([\u4e00-\u9fa5]{2,4})/g

// 角色名贪婪匹配的“伪姓名”剔除表：角色词后紧跟的常见动词/法律术语，
// 用于截断 ROLE_NAME_PATTERN 匹配出的非人名后缀（如「乙方签订合同」→ 只保留「乙方」）。
// 2 字词表 + 单字动词表（单字表避免收录人名常用字）。
const ROLE_NON_NAME_2 = new Set([
  '签订', '合同', '协议', '提出', '不服', '应诉', '到庭', '上诉', '起诉', '请求',
  '支付', '交付', '主张', '认为', '辩称', '陈述', '要求', '答辩', '缺席', '撤回',
  '变更', '解除', '终止', '履行', '违约', '赔偿', '返还', '退还', '清偿', '承担',
  '保证', '担保', '抵押', '质押', '转让', '租赁', '委托', '授权', '代理', '生效',
  '成立', '补充', '修改', '更正', '声明', '确认', '同意', '反对', '认可', '否认',
  '接受', '拒绝', '放弃', '保全', '执行', '申请', '立案', '审理', '判决', '裁定',
  '调解', '和解', '撤诉', '反诉', '回避', '管辖', '送达', '举证', '质证', '作证',
  '出庭', '诉讼', '仲裁', '证据', '材料', '文件', '函件', '通知', '答复', '承诺',
  '交货', '付款', '收款', '退款', '结清', '对账', '结算', '费用', '金额', '款项',
  '货款', '租金', '报酬', '工资', '利息', '损失', '违约金', '赔偿金', '定金', '保证金',
  '发票', '收据', '凭证', '单据', '报告', '意见', '方案', '计划', '安排', '处理',
])
const ROLE_NON_NAME_1 = new Set(
  '签订交付提主应到付赔履诉请退返还收拒认辩称答审判裁调执保撤反申证质举作出上起承延续终止变改补盖开取结清对验安装调试培训维修存储运输投保纳欠拖逾罚扣抵冲票据登记备案批准许',
)

/**
 * 从 ROLE_NAME_PATTERN 贪婪匹配出的候选串中提取真实姓名：
 * 1) 已知姓名（partyNames/knownEntities）前缀匹配 → 最可靠，直接用之；
 * 2) 否则从尾部剥离常见动词/术语后缀（『签订合同』→ 剥光 → null；『王五不服』→『王五』）；
 * 3) 剥离后剩余不足 2 字视为非人名。
 */
function extractRoleName(candidate: string, knownNames: Set<string>): string | null {
  if (!candidate) return null
  // 1) 已知姓名优先（真实案件当事人姓名一定在 partyNames / knownEntities 中）
  if (knownNames.size > 0) {
    for (let len = Math.min(candidate.length, 4); len >= 2; len--) {
      const prefix = candidate.slice(0, len)
      if (knownNames.has(prefix)) return prefix
    }
  }
  // 2) 剥离尾部动词/术语后缀（按 2 字词整词剥离；再按单字动词剥离）
  let name = candidate
  while (name.length >= 2) {
    if (name.length === 2) {
      // 剩余整体本身是 2 字动词/术语 → 伪姓名（如「签订合同」→「签订」）→ 放弃
      if (ROLE_NON_NAME_2.has(name)) return null
      break
    }
    const tail2 = name.slice(-2)
    if (ROLE_NON_NAME_2.has(tail2)) {
      name = name.slice(0, -2)
      continue
    }
    const tail1 = name.slice(-1)
    if (ROLE_NON_NAME_1.has(tail1)) {
      name = name.slice(0, -1)
      continue
    }
    break
  }
  // 3) 剩余不足 2 字，或以连词/虚词开头（「与甲方」「同乙方」）→ 非人名 → 放弃
  if (name.length < 2) return null
  if (/^[与和及同由被向对给把将而并或但]/u.test(name)) return null
  return name
}
const DEFAULT_DYNAMIC_FIELDS = ['timeline', 'disputeChecklist', 'positions', 'partyAnalysis', 'potentialInterests', 'batna'] as const

export function buildSkillCatalog(): SkillCatalogEntry[] {
  const skillsDir = resolve(process.cwd(), 'uploads', 'skills')
  const metaFile = resolve(skillsDir, '.skills.json')
  const uploaded: SkillCatalogEntry[] = []

  if (existsSync(metaFile)) {
    try {
      const meta = JSON.parse(readFileSync(metaFile, 'utf8'))
      for (const item of Array.isArray(meta) ? meta : []) {
        if (!item?.enabled || !item?.dirName) continue
        const manifestPath = resolve(skillsDir, item.dirName, 'manifest.json')
        let manifest: Record<string, any> = {}
        if (existsSync(manifestPath)) {
          try {
            manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
          } catch {}
        }
        uploaded.push({
          id: String(item.id || item.dirName),
          name: String(manifest.name || item.name || item.dirName),
          description: String(manifest.description || item.description || '已启用技能'),
          prompt: readSkillPrompt(resolve(skillsDir, item.dirName), manifest),
          source: 'uploaded',
        })
      }
    } catch {}
  }

  return [...uploaded, ...BUILTIN_SKILLS]
}

function readSkillPrompt(skillDir: string, manifest: Record<string, any>): string | undefined {
  if (typeof manifest.prompt === 'string' && manifest.prompt.trim()) {
    return manifest.prompt.trim()
  }

  for (const candidate of ['PROMPT.md', 'README.md', 'prompt.txt']) {
    const filePath = resolve(skillDir, candidate)
    if (!existsSync(filePath)) continue
    try {
      return readFileSync(filePath, 'utf8').slice(0, 1200).trim()
    } catch {}
  }

  return undefined
}

export async function runDesensitizedSkillWorkflow(options: WorkflowRunOptions) {
  const skillCatalog = options.skillCatalog || buildSkillCatalog()
  const skillPrompt = buildSkillPrompt(options.analysisType, skillCatalog)
  const desensitize = options.desensitize || (async (materials: string) =>
    desensitizeCaseMaterials(materials, {
      knownEntities: options.knownEntities || [],
      partyNames: options.partyNames,
      addresses: options.addresses,
      rules: options.rules,
    }))
  const restore = options.restore || defaultRestore
  const analyzeWithCloudSkills = options.analyzeWithCloudSkills || defaultCloudSkillAnalysis

  const desensitized = await desensitize(options.materials)

  // 加密持久化脱敏映射（AES-256-GCM → .data/mediation.db）。
  // desensitizeCaseMaterials 本身不再合成 traceId；若调用方已注入（测试/外部 store）则保留。
  if (!desensitized.traceId) {
    desensitized.traceId = persistDesensitization(
      (options as any).caseNumber || (options as any).caseId || 'TEXT',
      desensitized.mapping || {},
    )
  }

  const cloudOutput = await analyzeWithCloudSkills({
    analysisType: options.analysisType,
    maskedMaterials: desensitized.maskedText,
    skillPrompt,
    prompt: options.prompt || desensitized.maskedText,
    system: options.system || '',
  })
  const restoredOutput = await restore({
    traceId: desensitized.traceId,
    text: cloudOutput,
    mapping: desensitized.mapping,
  })

  return {
    traceId: desensitized.traceId,
    maskedMaterials: desensitized.maskedText,
    rawOutput: cloudOutput,
    restoredOutput,
    skillPrompt,
    mapping: desensitized.mapping,
  }
}

export async function generateDynamicFileWorkflow(
  caseNumber: string,
  options: { force?: boolean } = {},
): Promise<{ generated: string[]; skipped: string[]; reason?: string }> {
  const db = getDb()
  const existing = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseNumber)).get()
  const emptyFields = DEFAULT_DYNAMIC_FIELDS.filter((field) => {
    if (options.force) return true
    const value = existing?.[field]
    return !value || String(value).trim().length < 30
  })

  if (emptyFields.length === 0) {
    return { generated: [], skipped: [...DEFAULT_DYNAMIC_FIELDS], reason: 'already_complete' }
  }

  const bundle = await buildWorkflowBundle(caseNumber)
  if (bundle.materials.length < 50) {
    return { generated: [], skipped: [...DEFAULT_DYNAMIC_FIELDS], reason: 'insufficient_materials' }
  }

  const prompt = buildDynamicFilePrompt(bundle.caseData)
  const system = await withRagSupport(
    buildAnalysisSystemPrompt('dynamic_file'),
    `${bundle.caseData.title || ''} ${bundle.caseData.description || ''}`.slice(0, 200),
  )
  const result = await runDesensitizedSkillWorkflow({
    analysisType: 'dynamic_file',
    materials: bundle.materials,
    partyNames: bundle.partyNames,
    addresses: bundle.addresses,
    knownEntities: bundle.knownEntities,
    rules: getCaseRules(caseNumber),
    prompt,
    system,
  })

  let parsed: Record<string, string> = {}
  try {
    const jsonMatch = result.restoredOutput.match(/\{[\s\S]*\}/)
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
  } catch {
    throw new Error('AI 返回格式异常')
  }

  const updates: Record<string, string> = {}
  for (const field of emptyFields) {
    const value = parsed[field]
    if (value && String(value).trim().length > 10) {
      updates[field] = String(value).trim()
    }
  }

  if (Object.keys(updates).length === 0) {
    return { generated: [], skipped: [...DEFAULT_DYNAMIC_FIELDS], reason: 'ai_empty' }
  }

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

  return {
    generated: Object.keys(updates),
    skipped: DEFAULT_DYNAMIC_FIELDS.filter(field => !updates[field]),
  }
}

export async function runStructuredWorkflowAnalysis(
  caseNumber: string,
  analysisType: Exclude<WorkflowAnalysisType, 'dynamic_file'>,
): Promise<string> {
  const bundle = await buildWorkflowBundle(caseNumber)
  const { prompt, system } = await buildStructuredPrompt(bundle, analysisType)
  // 按案件加载脱敏规则（调解员在 desensitize-rules 配置的 mask/delete/keep 与启用状态）；
  // 未保存过规则时 getCaseRules 返回 SKILL.md 默认规则。
  const rules = getCaseRules(caseNumber)
  const result = await runDesensitizedSkillWorkflow({
    analysisType,
    materials: bundle.materials,
    partyNames: bundle.partyNames,
    addresses: bundle.addresses,
    knownEntities: bundle.knownEntities,
    rules,
    prompt,
    system,
  })

  return result.restoredOutput.trim()
}

/**
 * 上下文规模控制：依据目标技能/阶段的相关性筛选前序阶段输出，并设置总量预算。
 * 阶段流程顺序：V(0) → A(1) → L(2) → U(3) → E(4)。
 * 传入 currentPhase（如 'U'）时：
 *   - 仅保留来源阶段序号 <= 当前阶段序号 的前序输出（跳过未来阶段与同阶段旧结果）；
 *   - 按相关度（当前序号 - 来源序号，越小越相关）排序，在总量预算内优先保留更相关的输出；
 *   - 总量预算 CONTEXT_BUDGET_CHARS 控制 valueResults 拼接总长，避免后续阶段上下文膨胀溢出。
 */
const VALUE_PHASE_ORDER: Record<string, number> = { V: 0, A: 1, L: 2, U: 3, E: 4 }
const CONTEXT_BUDGET_CHARS = 8_000

function skillIdToPhase(skillId: string): string | null {
  const prefix = skillId?.[0]?.toUpperCase()
  return prefix && prefix in VALUE_PHASE_ORDER ? prefix : null
}

export interface WorkflowBundleOptions {
  /** 当前正在运行的技能 id（如 'u3'），用于按相关性筛选前序阶段输出 */
  currentSkillId?: string
  /** 当前阶段（如 'U'）；优先级高于 currentSkillId */
  currentPhase?: string
  /** 技能上下文配置规则：字段白名单/前序阶段/附件策略 */
  context?: {
    fields?: string[]
    priorPhases?: string[]
    includeDocs?: boolean
    useRag?: boolean
  }
}

export async function buildWorkflowBundle(caseNumber: string, opts: WorkflowBundleOptions = {}): Promise<WorkflowBundle> {
  const db = getDb()
  const caseData = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
  if (!caseData) throw new Error('案件不存在')

  const application = db.select().from(caseApplications).where(eq(caseApplications.caseId, caseNumber)).get()
  const dynamicFile = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseNumber)).get()
  const docs = db.select().from(documents).where(eq(documents.caseId, caseNumber)).all()
  const docTexts = docs.slice(0, 3).map((doc) => ({
    originalName: doc.originalName,
    text: extractDocumentText(doc.path, doc.originalName),
  })).filter(doc => doc.text.trim())

  const priorAnalyses = {
    claim_basis: getPriorAnalysis(caseNumber, 'claim_basis'),
    anticipate_defense: getPriorAnalysis(caseNumber, 'anticipate_defense'),
    evidence_checklist: getPriorAnalysis(caseNumber, 'evidence_checklist'),
    recommend_solution: getPriorAnalysis(caseNumber, 'recommend_solution'),
  }

  // 收集本案件已完成的 VALUE(value_*) 技能结果，供后续阶段/技能串联使用
  const valueRows = db.select().from(caseAnalyses)
    .where(and(eq(caseAnalyses.caseId, caseNumber), like(caseAnalyses.analysisType, 'value_%')))
    .all()
  const allValueResults = valueRows
    .map((row) => ({ skillId: row.analysisType.replace(/^value_/, ''), content: row.content || '' }))
    .filter((r) => r.content.trim())

  // ── 上下文规模控制：按目标阶段相关性筛选 + 总量预算 ──
  const targetPhase = opts.currentPhase
    ? (opts.currentPhase.toUpperCase() as keyof typeof VALUE_PHASE_ORDER)
    : opts.currentSkillId
      ? (skillIdToPhase(opts.currentSkillId) as keyof typeof VALUE_PHASE_ORDER)
      : undefined

  let valueResults = allValueResults
  if (targetPhase && targetPhase in VALUE_PHASE_ORDER) {
    const targetOrder = VALUE_PHASE_ORDER[targetPhase]
    // 1) 只保留来源阶段早于或等于当前阶段的前序输出（跳过未来阶段与同阶段旧结果）
    const eligible = allValueResults
      .map((r) => {
        const srcPhase = skillIdToPhase(r.skillId)
        return { ...r, srcPhase }
      })
      .filter((r) => r.srcPhase && VALUE_PHASE_ORDER[r.srcPhase] <= targetOrder)

    // 2) 按相关度排序（来源阶段越靠近当前阶段越相关，同阶段按完成先后取最新）
    eligible.sort((a, b) => {
      const da = targetOrder - VALUE_PHASE_ORDER[a.srcPhase!]
      const db_ = targetOrder - VALUE_PHASE_ORDER[b.srcPhase!]
      return da - db_ || b.content.length - a.content.length
    })

    // 3) 总量预算：在 CONTEXT_BUDGET_CHARS 内优先保留更相关输出
    const budgeted: typeof eligible = []
    let used = 0
    for (const item of eligible) {
      const len = item.content.length
      if (used + len > CONTEXT_BUDGET_CHARS) {
        // 预算不足时按比例截断最后一条
        const remain = CONTEXT_BUDGET_CHARS - used
        if (remain > 500) budgeted.push({ ...item, content: item.content.slice(0, remain) })
        break
      }
      budgeted.push(item)
      used += len
    }
    // 恢复流程顺序（V→A→L→U→E）便于阅读
    budgeted.sort((a, b) => VALUE_PHASE_ORDER[a.srcPhase!] - VALUE_PHASE_ORDER[b.srcPhase!])
    valueResults = budgeted.map(({ skillId, content }) => ({ skillId, content }))
  }

  const partyNames = Array.from(new Set([
    caseData.partyAName,
    caseData.partyBName,
    application?.applicantName,
    application?.respondentName,
    application?.agentName,
  ].filter((name): name is string => !!name)))

  const addresses = Array.from(new Set([
    application?.applicantAddress,
    application?.respondentAddress,
  ].filter((addr): addr is string => !!addr)))

  const knownEntities: KnownEntity[] = []
  if (caseData.partyAName) knownEntities.push({ value: caseData.partyAName, category: '申请人' })
  if (caseData.partyBName) knownEntities.push({ value: caseData.partyBName, category: '被申请人' })
  if (application?.agentName) knownEntities.push({ value: application.agentName, category: '委托代理人' })
  for (const address of addresses) knownEntities.push({ value: address, category: '地址' })

  // ── 上下文配置：按技能 context.fields 白名单组装案件字段，缺省则全量 ──
  const fieldSections: Record<string, string | false> = {
    title: caseData.title && `【案件标题】${caseData.title}`,
    partyNames: `【当事人】申请人：${caseData.partyAName}；被申请人：${caseData.partyBName}`,
    description: caseData.description && `【案件描述】${caseData.description}`,
    claimsSummary: caseData.claimsSummary && `【主张与答辩摘要】${caseData.claimsSummary}`,
    evidenceSummary: caseData.evidenceSummary && `【证据与质证摘要】${caseData.evidenceSummary}`,
    caseFacts: application?.caseFacts && `【案件事实】${application.caseFacts}`,
    disputeMatters: application?.disputeMatters && `【争议事项】${application.disputeMatters}`,
    mediationDemands: application?.mediationDemands && `【调解请求】${application.mediationDemands}`,
    demandsBasis: application?.demandsBasis && `【请求依据】${application.demandsBasis}`,
    timeline: dynamicFile?.timeline && `【已有时间线】${dynamicFile.timeline}`,
    disputeChecklist: dynamicFile?.disputeChecklist && `【已有争议清单】${dynamicFile.disputeChecklist}`,
    positions: dynamicFile?.positions && `【已有立场】${dynamicFile.positions}`,
    potentialInterests: dynamicFile?.potentialInterests && `【已有利益点】${dynamicFile.potentialInterests}`,
    batna: dynamicFile?.batna && `【已有 BATNA】${dynamicFile.batna}`,
  }

  const contextFields = opts.context?.fields
  const selectedFields = contextFields && contextFields.length > 0
    ? contextFields.filter((f) => fieldSections[f])
    : Object.keys(fieldSections)

  const sections = [
    ...selectedFields.map((f) => fieldSections[f]),
    ...(opts.context?.includeDocs !== false
      ? docTexts.map((doc) => `【附件材料：${doc.originalName}】\n${doc.text.slice(0, 4000)}`)
      : []),
    ...(valueResults.length
      ? [`【本案件已完成的 VALUE 技能分析结果（供当前技能参考，勿重复）】\n${valueResults
          .map((r) => `--- ${r.skillId} ---\n${r.content.slice(0, 3000)}`)
          .join('\n\n')}`]
      : []),
  ].filter(Boolean)

  return {
    caseData,
    application,
    dynamicFile,
    docs: docTexts,
    priorAnalyses,
    valueResults,
    materials: sections.join('\n\n'),
    partyNames,
    addresses,
    knownEntities,
  }
}

function getPriorAnalysis(
  caseNumber: string,
  analysisType: Exclude<WorkflowAnalysisType, 'dynamic_file'>,
): string {
  const db = getDb()
  const row = db
    .select()
    .from(caseAnalyses)
    .where(and(eq(caseAnalyses.caseId, caseNumber), eq(caseAnalyses.analysisType, analysisType)))
    .get()
  return row?.content || ''
}

function buildSkillPrompt(analysisType: WorkflowAnalysisType, catalog: SkillCatalogEntry[]): string {
  const selected = catalog.slice(0, 8)
  const lines = selected.map((skill, index) => {
    const prompt = skill.prompt ? ` 执行要求：${skill.prompt}` : ''
    return `${index + 1}. ${skill.name}（${skill.source}）- ${skill.description}${prompt}`
  })
  return [
    `你必须以“技能编排”的方式完成 ${analysisType} 分析，逐条运用下列 skills：`,
    ...lines,
    '输出时要体现你综合了技能结论，而不是简单复述材料。',
  ].join('\n')
}

function buildAnalysisSystemPrompt(type: WorkflowAnalysisType): string {
  return [
    '你是商事调解平台的云端智能体。',
    '你接收的材料已经过本地脱敏，绝不能猜测或扩写真实身份信息。',
    '请严格依据 skills 进行分析，输出内容必须专业、可执行、结构化。',
    `当前任务类型：${type}`,
  ].join('\n')
}

async function buildStructuredPrompt(
  bundle: WorkflowBundle,
  analysisType: Exclude<WorkflowAnalysisType, 'dynamic_file'>,
): Promise<{ prompt: string; system: string }> {
  const safe = (value: any) => (value && String(value).trim()) || '（暂无）'
  let prompt = ''
  let query = `${bundle.caseData.title || ''} ${bundle.caseData.description || ''}`.slice(0, 200)

  if (analysisType === 'claim_basis') {
    prompt = `案件：${safe(bundle.caseData.title)}\n申请人：${safe(bundle.caseData.partyAName)}\n被申请人：${safe(bundle.caseData.partyBName)}\n描述：${safe(bundle.caseData.description)}\n主张：${safe(bundle.caseData.claimsSummary)}\n争议：${safe(bundle.dynamicFile?.disputeChecklist)}\n立场：${safe(bundle.dynamicFile?.positions)}\n材料：\n${bundle.materials}\n\n请输出请求权基础分析，覆盖构成要件、事实匹配、关键证据、举证责任、主要风险、调解策略，800-1500字。`
  } else if (analysisType === 'anticipate_defense') {
    prompt = `案件：${safe(bundle.caseData.title)}\n申请人：${safe(bundle.caseData.partyAName)}\n被申请人：${safe(bundle.caseData.partyBName)}\n描述：${safe(bundle.caseData.description)}\n时间线：${safe(bundle.dynamicFile?.timeline)}\n争议：${safe(bundle.dynamicFile?.disputeChecklist)}\n立场：${safe(bundle.dynamicFile?.positions)}\n利益：${safe(bundle.dynamicFile?.potentialInterests)}\nBATNA：${safe(bundle.dynamicFile?.batna)}\n材料：\n${bundle.materials}\n\n请预测程序抗辩、实体抗辩、举证抗辩、和解空间，800-1500字。`
  } else if (analysisType === 'evidence_checklist') {
    prompt = `案件：${safe(bundle.caseData.title)}\n当事人：${safe(bundle.caseData.partyAName)} vs ${safe(bundle.caseData.partyBName)}\n描述：${safe(bundle.caseData.description)}\n时间线：${safe(bundle.dynamicFile?.timeline)}\n争议：${safe(bundle.dynamicFile?.disputeChecklist)}\n已上传材料：${bundle.docs.map(doc => doc.originalName).join('、') || '（暂无）'}\n材料：\n${bundle.materials}\n\n请输出证据清单，包含待证事实、现有证据、缺口、补强建议、取证优先级，1000-1500字。`
  } else if (analysisType === 'evaluation') {
    prompt = `你是专业的商事案件分析评估专家。请基于以下案件材料，生成一份完整的《案情分析评估报告》，严格按以下 6 个部分输出（顺序固定，每部分用中文序号标题）：

一、案件基本信息
（案由、仲裁机构/规则、争议金额、关键时间节点等，只依据材料写明，材料未载明的标注"材料未载明"）

二、当事人基本情况
（申请人、被申请人，自然人或公司主体、联系方式、身份信息等，材料未载明的标注"材料未载明"）

三、本案仲裁请求分析
（仲裁请求、金额及计算方式、利息/违约金依据、构成要件与事实匹配、关键证据、举证责任）

四、全案综合风险评估
（重点风险、证据缺口、执行/抗辩焦点、程序与时效风险，逐条列出并注明来源）

五、解纷策略建议
（优先考虑调解路径，从时间与经济成本角度给出可选方案、BATNA/WATNA、推荐路径与下一步）

六、补充说明
（需要补充的信息、材料缺口，不超过300字）

## 硬性约束
- 只依据以下材料作答，不自行推算、不补全、不猜测；材料未载明的一律写"材料未载明/无法判断"。
- 各项分析要写成归纳要点句，不得直接截断原文。
- 正文不使用表格，用分段文字。
- 使用简体中文。

案件材料：
${bundle.materials}

请输出完整报告，总长度 800-3000 字。`
    query = `${query} 案情分析评估报告`
  } else {
    prompt = `你是调解专家。请综合案件材料与现有分析生成利益重构方案。\n\n案件：${safe(bundle.caseData.title)}\n申请人：${safe(bundle.caseData.partyAName)}\n被申请人：${safe(bundle.caseData.partyBName)}\n立场：${safe(bundle.dynamicFile?.positions)}\n利益：${safe(bundle.dynamicFile?.potentialInterests)}\nBATNA：${safe(bundle.dynamicFile?.batna)}\n\n请求权基础分析：\n${bundle.priorAnalyses.claim_basis || '（尚未分析）'}\n\n抗辩预测：\n${bundle.priorAnalyses.anticipate_defense || '（尚未分析）'}\n\n证据清单：\n${bundle.priorAnalyses.evidence_checklist || '（尚未分析）'}\n\n案件材料：\n${bundle.materials}\n\n请输出关键信息摘要、方案A/B/C、比较表、BATNA/WATNA、推荐方案、条款清单、履行时间表、风险提示，总长度 2000-3500 字。`
    query = `${query} 利益重构方案`
  }

  const system = await withRagSupport(buildAnalysisSystemPrompt(analysisType), query)
  return { prompt, system }
}

function buildDynamicFilePrompt(caseData: any): string {
  return `## 角色
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
- 当前案件标题：${caseData.title || '未命名案件'}
`
}

async function withRagSupport(system: string, query: string): Promise<string> {
  try {
    const kbResults = await searchKb(query, 3)
    if (kbResults.length > 0) {
      return `${system}\n\n## 可参考知识库\n${formatKbResultsForPrompt(kbResults)}`
    }
  } catch {}
  return system
}

async function defaultCloudSkillAnalysis(input: {
  analysisType: WorkflowAnalysisType
  maskedMaterials: string
  skillPrompt: string
  prompt: string
  system: string
}): Promise<string> {
  const userPrompt = [
    '## 待分析的脱敏案件材料',
    input.maskedMaterials,
    '',
    '## 输出要求',
    input.prompt,
  ].join('\n')

  const text = await llmChat({
    system: input.system,
    prompt: userPrompt,
    temperature: 0.3,
    // DeepSeek 的 max_tokens 同时覆盖 reasoning + content，调大避免长报告截断
    maxTokens: input.analysisType === 'recommend_solution' || input.analysisType === 'evaluation' ? 8000 : 6000,
    // 长材料 + 长输出（评估/方案 8000 tokens），给足时间避免超时
    timeoutMs: 300_000,
  }).catch((error: any) => {
    throw new Error(`AI调用失败: ${error.message}`)
  })

  return text.trim()
}

async function defaultRestore(input: {
  traceId: string
  text: string
  mapping: Record<string, string>
}): Promise<string> {
  void input.traceId
  return restoreText(input.text, input.mapping)
}

export async function desensitizeCaseMaterials(
  text: string,
  options: {
    knownEntities: KnownEntity[]
    partyNames: string[]
    addresses: string[]
    /** 脱敏规则复核；缺省按默认规则（全部启用）。 */
    rules?: DesensitizeRule[]
  },
): Promise<DesensitizedPayload> {
  const ruleIndex = rulesIndex(options.rules || [])

  /** 根据规则判断某类别是否参与脱敏（enabled 且 action !== 'keep'）。 */
  const shouldMask = (category: string) => {
    const rule = ruleIndex[category]
    if (!rule) return true
    if (!rule.enabled) return false
    return rule.action !== 'keep'
  }
  /** 根据规则判断某类别是 'delete'（直接删除）还是 'mask'（令牌替换）。 */
  const isDelete = (category: string) => {
    const rule = ruleIndex[category]
    return !!rule && rule.enabled && rule.action === 'delete'
  }

  const spans: Array<{ start: number; end: number; value: string; category: string }> = []

  for (const { category, pattern } of PII_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (!match[0] || typeof match.index !== 'number') continue
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        category,
      })
    }
  }

  for (const entity of options.knownEntities) {
    for (const match of text.matchAll(new RegExp(escapeRegExp(entity.value), 'g'))) {
      if (!match[0] || typeof match.index !== 'number') continue
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        category: entity.category,
      })
    }
  }

  for (const name of options.partyNames) {
    for (const match of text.matchAll(new RegExp(escapeRegExp(name), 'g'))) {
      if (!match[0] || typeof match.index !== 'number') continue
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        category: '姓名',
      })
    }
  }

  for (const address of options.addresses) {
    for (const match of text.matchAll(new RegExp(escapeRegExp(address), 'g'))) {
      if (!match[0] || typeof match.index !== 'number') continue
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        category: '地址',
      })
    }
  }

  // 已知姓名集合：优先用于角色名提取（真实当事人姓名必在 partyNames / knownEntities 中）
  const knownNames = new Set<string>([...options.partyNames, ...options.knownEntities.map((e) => e.value)])
  let roleMatch: RegExpExecArray | null
  while ((roleMatch = ROLE_NAME_PATTERN.exec(text)) !== null) {
    // 截断贪婪匹配出的伪姓名（如「乙方签订合同」→ 无姓名则跳过）
    const roleName = extractRoleName(roleMatch[2] || '', knownNames)
    if (!roleName) continue
    // 从「角色词后的汉字串」起始位置计算真实姓名区间（不吞角色词后的空白；
    // roleName 是候选串的前缀——剥离尾部动词后保留头部，故从 hanziStart 起算）
    const hanziStart = roleMatch.index + roleMatch[0].length - (roleMatch[2] || '').length
    const start = hanziStart
    spans.push({
      start,
      end: start + roleName.length,
      value: roleName,
      category: roleMatch[1] || '姓名',
    })
  }
  ROLE_NAME_PATTERN.lastIndex = 0

  // ── 规则复核过滤：禁用或 keep 的类别不参与脱敏 ──────────────
  const roleWords = ['原告', '被告', '申请人', '被申请人', '上诉人', '被上诉人', '甲方', '乙方', '委托代理人', '法定代表人', '第三人', '当事人']
  const ruleCategoryFor = (category: string) => (roleWords.includes(category) ? '角色姓名' : category)
  const filterable = spans.filter((span) => {
    const rule = ruleIndex[ruleCategoryFor(span.category)]
    if (!rule) return true
    if (!rule.enabled) return false
    return rule.action !== 'keep'
  })

  filterable.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
  const selected: typeof filterable = []
  let lastEnd = -1
  for (const span of filterable) {
    if (!span.value || span.start < lastEnd) continue
    selected.push(span)
    lastEnd = span.end
  }

  const mapping: Record<string, string> = {}
  const valueToToken = new Map<string, string>()
  const counters = new Map<string, number>()
  let maskedText = text

  for (const span of [...selected].sort((a, b) => b.start - a.start)) {
    // 规则 action='delete'：直接删除该片段，不生成令牌、不进入映射
    if (isDelete(ruleCategoryFor(span.category))) {
      maskedText = `${maskedText.slice(0, span.start)}${maskedText.slice(span.end)}`
      continue
    }
    let token = valueToToken.get(span.value)
    if (!token) {
      const leaf = categoryLeaf(span.category)
      const seq = (counters.get(leaf) || 0) + 1
      counters.set(leaf, seq)
      token = `[${leaf}_${seq}]`
      valueToToken.set(span.value, token)
      mapping[token] = span.value
    }
    maskedText = `${maskedText.slice(0, span.start)}${token}${maskedText.slice(span.end)}`
  }

  // ── 残余扫描门禁（对齐已退役 case-mcp-server/gateway.py）──────────────
  // 脱敏后重扫 5 类强格式 PII + 已知实体子串；发现残留即抛错，阻止出域。
  // 注意：与 Python 版一致，不重扫角色姓名模式（其由上层角色正则覆盖）。
  const residual = scanForResidualPii(maskedText, {
    partyNames: options.partyNames,
    addresses: options.addresses,
    knownEntities: options.knownEntities,
    rules: options.rules,
  })
  if (residual.length > 0) {
    throw new Error(`[脱敏漏检] 发现疑似未脱敏数据: ${residual.join(', ')}`)
  }

  return {
    maskedText,
    // traceId 由调用方通过 persistDesensitization 持久化后赋予
    mapping,
  }
}

export function scanForResidualPii(
  text: string,
  options: { partyNames: string[]; addresses: string[]; knownEntities: KnownEntity[]; rules?: DesensitizeRule[] },
): string[] {
  const ruleIndex = rulesIndex(options.rules || [])
  const skipCategory = (category: string) => {
    const rule = ruleIndex[category]
    if (!rule) return false
    return !rule.enabled || rule.action === 'keep'
  }

  const found: string[] = []
  const seen = new Set<string>()
  const add = (value: string) => {
    if (value && !seen.has(value)) {
      seen.add(value)
      found.push(value)
    }
  }

  for (const { category, pattern } of PII_PATTERNS) {
    if (skipCategory(category)) continue
    for (const match of text.matchAll(pattern)) {
      if (match[0]) add(match[0])
    }
  }
  if (!skipCategory('姓名')) {
    for (const name of options.partyNames) {
      if (name && text.includes(name)) add(name)
    }
  }
  if (!skipCategory('地址')) {
    for (const address of options.addresses) {
      if (address && text.includes(address)) add(address)
    }
  }
  for (const entity of options.knownEntities) {
    if (!entity?.value) continue
    if (skipCategory(entity.category)) continue
    if (text.includes(entity.value)) add(entity.value)
  }
  return found
}

function restoreText(text: string, mapping: Record<string, string>) {
  let restored = text
  for (const [token, value] of Object.entries(mapping).sort((a, b) => b[0].length - a[0].length)) {
    restored = restored.replaceAll(token, value)
  }
  return restored
}

function categoryLeaf(category: string) {
  if (category.includes('/')) return category.split('/').pop() || category
  if (category === '甲方') return '申请人'
  if (category === '乙方') return '被申请人'
  return category
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
