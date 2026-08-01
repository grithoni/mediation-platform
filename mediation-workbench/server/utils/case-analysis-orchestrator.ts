import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../database'
import {
  caseAnalyses,
  caseApplications,
  caseDynamicFiles,
  cases,
  documents,
} from '../database/schema'
import { formatKbResultsForPrompt, searchKb } from './kb-search'

export type WorkflowAnalysisType =
  | 'dynamic_file'
  | 'claim_basis'
  | 'anticipate_defense'
  | 'evidence_checklist'
  | 'recommend_solution'

export interface SkillCatalogEntry {
  id: string
  name: string
  description: string
  prompt?: string
  source: 'uploaded' | 'builtin'
}

export interface DesensitizedPayload {
  maskedText: string
  traceId: string
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
}

interface WorkflowBundle {
  caseData: any
  application: any
  dynamicFile: any
  docs: Array<{ originalName: string; text: string }>
  priorAnalyses: Partial<Record<Exclude<WorkflowAnalysisType, 'dynamic_file'>, string>>
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
]

const ROLE_NAME_PATTERN = /(原告|被告|申请人|被申请人|甲方|乙方|委托代理人|法定代表人)\s*([\u4e00-\u9fa5]{2,4})/g
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
    }))
  const restore = options.restore || defaultRestore
  const analyzeWithCloudSkills = options.analyzeWithCloudSkills || defaultCloudSkillAnalysis

  const desensitized = await desensitize(options.materials)
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
  const result = await runDesensitizedSkillWorkflow({
    analysisType,
    materials: bundle.materials,
    partyNames: bundle.partyNames,
    addresses: bundle.addresses,
    knownEntities: bundle.knownEntities,
    prompt,
    system,
  })

  return result.restoredOutput.trim()
}

async function buildWorkflowBundle(caseNumber: string): Promise<WorkflowBundle> {
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

  const partyNames = Array.from(new Set([
    caseData.partyAName,
    caseData.partyBName,
    application?.applicantName,
    application?.respondentName,
    application?.agentName,
  ].filter(Boolean)))

  const addresses = Array.from(new Set([
    application?.applicantAddress,
    application?.respondentAddress,
  ].filter(Boolean)))

  const knownEntities: KnownEntity[] = []
  if (caseData.partyAName) knownEntities.push({ value: caseData.partyAName, category: '申请人' })
  if (caseData.partyBName) knownEntities.push({ value: caseData.partyBName, category: '被申请人' })
  if (application?.agentName) knownEntities.push({ value: application.agentName, category: '委托代理人' })
  for (const address of addresses) knownEntities.push({ value: address, category: '地址' })

  const sections = [
    caseData.title && `【案件标题】${caseData.title}`,
    `【当事人】申请人：${caseData.partyAName}；被申请人：${caseData.partyBName}`,
    caseData.description && `【案件描述】${caseData.description}`,
    caseData.claimsSummary && `【主张与答辩摘要】${caseData.claimsSummary}`,
    caseData.evidenceSummary && `【证据与质证摘要】${caseData.evidenceSummary}`,
    application?.caseFacts && `【案件事实】${application.caseFacts}`,
    application?.disputeMatters && `【争议事项】${application.disputeMatters}`,
    application?.mediationDemands && `【调解请求】${application.mediationDemands}`,
    application?.demandsBasis && `【请求依据】${application.demandsBasis}`,
    dynamicFile?.timeline && `【已有时间线】${dynamicFile.timeline}`,
    dynamicFile?.disputeChecklist && `【已有争议清单】${dynamicFile.disputeChecklist}`,
    dynamicFile?.positions && `【已有立场】${dynamicFile.positions}`,
    dynamicFile?.potentialInterests && `【已有利益点】${dynamicFile.potentialInterests}`,
    dynamicFile?.batna && `【已有 BATNA】${dynamicFile.batna}`,
    ...docTexts.map((doc) => `【附件材料：${doc.originalName}】\n${doc.text.slice(0, 4000)}`),
  ].filter(Boolean)

  return {
    caseData,
    application,
    dynamicFile,
    docs: docTexts,
    priorAnalyses,
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

function extractDocumentText(filePath: string, originalName: string): string {
  try {
    const lower = originalName.toLowerCase()
    if (lower.endsWith('.pdf')) {
      return execSync(`pdftotext -layout "${filePath}" -`, {
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 5 * 1024 * 1024,
      })
    }
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      return execSync(`textutil -convert txt -stdout "${filePath}"`, {
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 5 * 1024 * 1024,
      })
    }
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
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
  const config = useRuntimeConfig()
  if (!config.openaiApiKey) throw new Error('未配置 AI API Key')

  const { generateText } = await import('ai')
  const { createOpenAI } = await import('@ai-sdk/openai')

  const openai = createOpenAI({
    apiKey: config.openaiApiKey as string,
    baseURL: config.openaiBaseUrl as string,
  })

  const userPrompt = [
    '## Skills',
    input.skillPrompt,
    '',
    '## 待分析的脱敏案件材料',
    input.maskedMaterials,
    '',
    '## 输出要求',
    input.prompt,
  ].join('\n')

  const result = await generateText({
    model: openai((config.openaiModel as string) || 'deepseek-v4-pro'),
    system: input.system,
    prompt: userPrompt,
    temperature: 0.3,
    maxTokens: input.analysisType === 'recommend_solution' ? 4000 : 3200,
  }).catch((error: any) => {
    throw new Error(`AI调用失败: ${error.message}`)
  })

  return result.text.trim()
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
  },
): Promise<DesensitizedPayload> {
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

  let roleMatch: RegExpExecArray | null
  while ((roleMatch = ROLE_NAME_PATTERN.exec(text)) !== null) {
    spans.push({
      start: roleMatch.index + roleMatch[1].length,
      end: roleMatch.index + roleMatch[0].length,
      value: roleMatch[2] || '',
      category: roleMatch[1] || '姓名',
    })
  }
  ROLE_NAME_PATTERN.lastIndex = 0

  const localNerEntities = await detectLocalNerEntities(text)
  for (const entity of localNerEntities) spans.push(entity)

  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
  const selected: typeof spans = []
  let lastEnd = -1
  for (const span of spans) {
    if (!span.value || span.start < lastEnd) continue
    selected.push(span)
    lastEnd = span.end
  }

  const mapping: Record<string, string> = {}
  const valueToToken = new Map<string, string>()
  const counters = new Map<string, number>()
  let maskedText = text

  for (const span of [...selected].sort((a, b) => b.start - a.start)) {
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

  return {
    maskedText,
    traceId: `trace-${Date.now()}`,
    mapping,
  }
}

async function detectLocalNerEntities(text: string) {
  const config = useRuntimeConfig()
  const model = String((config as any).localNerModel || process.env.LOCAL_NER_MODEL || '').trim()
  const baseUrl = String((config as any).localNerBaseUrl || process.env.LOCAL_NER_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
  if (!model) return []

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: `请从以下文本中提取人名、组织、地址，返回 JSON 数组，每个元素包含 category 和 value 字段。文本：\n${text}`,
        }],
      }),
    })
    if (!response.ok) return []
    const payload = await response.json() as any
    const content = payload?.choices?.[0]?.message?.content || ''
    const start = String(content).indexOf('[')
    const end = String(content).lastIndexOf(']')
    if (start === -1 || end === -1) return []
    const entities = JSON.parse(String(content).slice(start, end + 1))
    if (!Array.isArray(entities)) return []

    const spans: Array<{ start: number; end: number; value: string; category: string }> = []
    for (const entity of entities) {
      const value = String(entity?.value || '').trim()
      const category = String(entity?.category || '').trim() || '姓名'
      if (!value) continue
      for (const match of text.matchAll(new RegExp(escapeRegExp(value), 'g'))) {
        if (!match[0] || typeof match.index !== 'number') continue
        spans.push({
          start: match.index,
          end: match.index + match[0].length,
          value,
          category,
        })
      }
    }
    return spans
  } catch {
    return []
  }
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
