import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { getDb } from '../database'
import {
  caseApplications,
  caseDynamicFiles,
  cases,
  documents,
} from '../database/schema'
import { buildSkillCatalog, desensitizeCaseMaterials, runStructuredWorkflowAnalysis } from './case-analysis-orchestrator'
import { runGaAgentLoop } from './ga-core/loop'
import type {
  GaMessage,
  GaStepOutcome,
  GaToolArgs,
  GaToolCall,
  GaToolDefinition,
  GaToolHandler,
} from './ga-core/types'

interface MediationRuntimeState {
  materials: string
  traceId: string
  maskedMaterials: string
  mapping: Record<string, string>
  restoredResult: string
  lastMaskedAnalysis: string
  lastAnalysisType: string
}

interface MediationAgentTaskOptions {
  caseId: string
  task: string
  llmCall: (
    messages: GaMessage[],
    tools: GaToolDefinition[],
  ) => AsyncGenerator<string, { content: string; toolCalls: GaToolCall[] }, unknown>
  handlers?: Partial<Record<string, (args: GaToolArgs) => Promise<GaStepOutcome> | GaStepOutcome>>
}

interface MediationBackgroundAnalysisOptions {
  handlers?: MediationAgentTaskOptions['handlers']
}

export function buildMediationToolCatalog(): GaToolDefinition[] {
  return [
    defineTool('query_case_materials', '读取案件材料、申请表信息和已上传附件摘要，用于调解分析前的材料汇总。', {}),
    defineTool('desensitize_case_materials', '调用本地脱敏流程，将案件材料转换为可安全出域的脱敏文本。', {}),
    defineTool('analyze_with_mediation_skills', '基于调解专用 skills 对案件进行结构化分析，输出脱敏后的结论。', {
      analysisType: { type: 'string', description: '分析类型，如 dynamic_file / claim_basis / recommend_solution' },
    }),
    defineTool('restore_analysis_result', '将脱敏分析结果反脱敏，恢复可回写给调解员的真实输出。', {
      maskedResult: { type: 'string', description: '包含脱敏令牌的分析结果' },
    }, ['maskedResult']),
    defineTool('writeback_case_analysis', '将分析结果写回案件动态文件或专家分析字段。', {
      agentAnalysis: { type: 'string', description: '反脱敏后的案件分析结果' },
      materialChecklist: { type: 'string', description: '材料补正清单' },
    }),
  ]
}

export async function runMediationAgentTask(options: MediationAgentTaskOptions) {
  const executedTools: string[] = []
  let finalText = ''
  let finalData: unknown
  const runtimeState: MediationRuntimeState = {
    materials: '',
    traceId: '',
    maskedMaterials: '',
    mapping: {},
    restoredResult: '',
    lastMaskedAnalysis: '',
    lastAnalysisType: '',
  }

  const tools = buildMediationToolCatalog()
  const handlers = buildMediationToolHandlers(options.caseId, runtimeState, options.handlers)

  const agentGen = runGaAgentLoop({
    systemPrompt: buildMediationSystemPrompt(),
    userInput: options.task,
    caseId: options.caseId,
    workDir: resolve(process.cwd(), 'uploads', 'cases', options.caseId),
    tools,
    handlers,
    llmCall: options.llmCall,
    maxTurns: 12,
  })

  for await (const progress of agentGen) {
    if (progress.type === 'tool_call' && progress.toolName) {
      executedTools.push(progress.toolName)
    }
    if (progress.type === 'done') {
      finalText = progress.content || ''
      finalData = progress.data
    }
  }

  return {
    finalText,
    executedTools,
    finalData,
    runtimeState,
  }
}

export function buildMediationToolHandlers(
  caseId: string,
  runtimeState: MediationRuntimeState,
  overrides: MediationAgentTaskOptions['handlers'] = {},
): Record<string, GaToolHandler> {
  const defaults: Record<string, GaToolHandler> = {
    query_case_materials: async () => {
      runtimeState.materials = loadCaseMaterials(caseId)
      return {
        data: { materials: runtimeState.materials },
        nextPrompt: '已读取案件材料，请继续执行下一步。',
      }
    },
    desensitize_case_materials: async () => {
      const result = await desensitizeCaseMaterials(runtimeState.materials, inferKnownEntities(caseId))
      runtimeState.traceId = result.traceId
      runtimeState.maskedMaterials = result.maskedText
      runtimeState.mapping = result.mapping
      return {
        data: {
          traceId: result.traceId,
          maskedMaterials: result.maskedText,
        },
        nextPrompt: '已完成本地脱敏，请基于脱敏材料继续分析。',
      }
    },
    analyze_with_mediation_skills: async (args) => {
      const analysisType = String(args.analysisType || 'dynamic_file') as any
      const content = analysisType === 'dynamic_file'
        ? runtimeState.maskedMaterials
        : await runStructuredWorkflowAnalysis(caseId, analysisType)
      runtimeState.lastMaskedAnalysis = content
      runtimeState.lastAnalysisType = analysisType
      return {
        data: {
          analysisType,
          content,
          skills: buildSkillCatalog().map(skill => skill.name),
        },
        nextPrompt: '已基于调解 skills 生成分析，请决定是否需要反脱敏或回写。',
      }
    },
    restore_analysis_result: async (args) => {
      const maskedResult = String(args.maskedResult || runtimeState.lastMaskedAnalysis || runtimeState.maskedMaterials || '')
      let restored = maskedResult
      for (const [token, value] of Object.entries(runtimeState.mapping)) {
        restored = restored.replaceAll(token, value)
      }
      runtimeState.restoredResult = restored
      return {
        data: { traceId: runtimeState.traceId, restored },
        nextPrompt: '已完成反脱敏，请输出最终结论或调用 writeback_case_analysis。',
      }
    },
    writeback_case_analysis: async (args) => {
      const db = getDb()
      const now = Date.now()
      const existing = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseId)).get()
      const patch = {
        agentAnalysis: String(args.agentAnalysis || runtimeState.restoredResult || ''),
        materialChecklist: String(args.materialChecklist || ''),
        agentStatus: 'done',
        agentUpdatedAt: now,
        updatedAt: now,
      }

      if (existing) {
        db.update(caseDynamicFiles).set(patch).where(eq(caseDynamicFiles.caseId, caseId)).run()
      } else {
        db.insert(caseDynamicFiles).values({
          id: `cdf-${caseId}`,
          caseId,
          ...patch,
          createdAt: now,
        }).run()
      }

      return {
        data: patch,
        nextPrompt: null,
      }
    },
  }

  const merged: Record<string, GaToolHandler> = { ...defaults }
  for (const [name, handler] of Object.entries(overrides || {})) {
    if (!handler) continue
    merged[name] = async (args) => handler(args)
  }

  return merged
}

export async function runMediationBackgroundAnalysis(
  caseId: string,
  options: MediationBackgroundAnalysisOptions = {},
) {
  const runtimeState: MediationRuntimeState = {
    materials: '',
    traceId: '',
    maskedMaterials: '',
    mapping: {},
    restoredResult: '',
    lastMaskedAnalysis: '',
    lastAnalysisType: '',
  }
  const handlers = buildMediationToolHandlers(caseId, runtimeState, options.handlers)

  const runStep = async (toolName: string, args: GaToolArgs = {}) => {
    const handler = handlers[toolName]
    if (!handler) throw new Error(`Missing mediation handler: ${toolName}`)
    const result = await exhaustMediationStep(handler(args, {
      caseId,
      workDir: resolve(process.cwd(), 'uploads', 'cases', caseId),
      maxTurns: 1,
      currentTurn: 1,
      workingCheckpoint: '',
      fullResponse: '',
      stopRequested: false,
    }))
    syncRuntimeState(runtimeState, toolName, result.data)
    return result
  }

  await runStep('query_case_materials')
  await runStep('desensitize_case_materials')

  await runStep('analyze_with_mediation_skills', { analysisType: 'claim_basis' })
  const analysisOutcome = await runStep('restore_analysis_result', { maskedResult: runtimeState.lastMaskedAnalysis })
  const agentAnalysis = String((analysisOutcome.data as { restored?: string } | undefined)?.restored || runtimeState.restoredResult || '')

  await runStep('analyze_with_mediation_skills', { analysisType: 'evidence_checklist' })
  const checklistOutcome = await runStep('restore_analysis_result', { maskedResult: runtimeState.lastMaskedAnalysis })
  const materialChecklist = String((checklistOutcome.data as { restored?: string } | undefined)?.restored || runtimeState.restoredResult || '')

  await runStep('writeback_case_analysis', {
    agentAnalysis,
    materialChecklist,
  })

  return {
    caseId,
    agentAnalysis,
    materialChecklist,
    traceId: runtimeState.traceId,
  }
}

async function exhaustMediationStep(
  value: AsyncGenerator<string, GaStepOutcome> | Promise<GaStepOutcome> | GaStepOutcome,
): Promise<GaStepOutcome> {
  if (value && typeof (value as AsyncGenerator<string, GaStepOutcome>).next === 'function') {
    const gen = value as AsyncGenerator<string, GaStepOutcome>
    let iter = await gen.next()
    while (!iter.done) {
      iter = await gen.next()
    }
    return iter.value
  }
  return await Promise.resolve(value as GaStepOutcome)
}

function syncRuntimeState(runtimeState: MediationRuntimeState, toolName: string, data: unknown) {
  if (!data || typeof data !== 'object') return
  const payload = data as Record<string, unknown>

  if (toolName === 'query_case_materials' && typeof payload.materials === 'string') {
    runtimeState.materials = payload.materials
  }

  if (toolName === 'desensitize_case_materials') {
    if (typeof payload.traceId === 'string') runtimeState.traceId = payload.traceId
    if (typeof payload.maskedMaterials === 'string') runtimeState.maskedMaterials = payload.maskedMaterials
  }

  if (toolName === 'analyze_with_mediation_skills') {
    if (typeof payload.content === 'string') runtimeState.lastMaskedAnalysis = payload.content
    if (typeof payload.analysisType === 'string') runtimeState.lastAnalysisType = payload.analysisType
  }

  if (toolName === 'restore_analysis_result' && typeof payload.restored === 'string') {
    runtimeState.restoredResult = payload.restored
  }
}

function defineTool(
  name: string,
  description: string,
  properties: GaToolDefinition['function']['parameters']['properties'],
  required: string[] = [],
): GaToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  }
}

function buildMediationSystemPrompt() {
  return [
    '你是嵌入调解工作台的 GenericAgent 风格调解智能体。',
    '你必须先读取案件材料，再执行本地脱敏，然后才能做分析。',
    '需要输出给调解员的内容在出域分析后必须调用 restore_analysis_result 反脱敏。',
    '当分析完成且结果可回写时，优先调用 writeback_case_analysis。',
  ].join('\n')
}

function loadCaseMaterials(caseId: string) {
  const db = getDb()
  const caseData = db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) return ''
  const application = db.select().from(caseApplications).where(eq(caseApplications.caseId, caseId)).get()
  const caseDocs = db.select().from(documents).where(eq(documents.caseId, caseId)).all()

  const docSnippets = caseDocs.slice(0, 3).map((doc) => {
    try {
      return `【附件：${doc.originalName}】\n${readFileSync(doc.path, 'utf-8').slice(0, 2000)}`
    } catch {
      return `【附件：${doc.originalName}】\n（内容暂不可直接读取）`
    }
  })

  return [
    `【案件标题】${caseData.title}`,
    `【申请人】${caseData.partyAName}`,
    `【被申请人】${caseData.partyBName}`,
    caseData.description ? `【案件描述】${caseData.description}` : '',
    caseData.claimsSummary ? `【主张摘要】${caseData.claimsSummary}` : '',
    caseData.evidenceSummary ? `【证据摘要】${caseData.evidenceSummary}` : '',
    application?.caseFacts ? `【案件事实】${application.caseFacts}` : '',
    application?.disputeMatters ? `【争议事项】${application.disputeMatters}` : '',
    ...docSnippets,
  ].filter(Boolean).join('\n\n')
}

function inferKnownEntities(caseId: string) {
  const db = getDb()
  const caseData = db.select().from(cases).where(eq(cases.id, caseId)).get()
  const application = db.select().from(caseApplications).where(eq(caseApplications.caseId, caseId)).get()

  return {
    partyNames: [caseData?.partyAName, caseData?.partyBName, application?.applicantName, application?.respondentName].filter(Boolean) as string[],
    addresses: [application?.applicantAddress, application?.respondentAddress].filter(Boolean) as string[],
    knownEntities: [
      caseData?.partyAName ? { value: caseData.partyAName, category: '申请人' } : null,
      caseData?.partyBName ? { value: caseData.partyBName, category: '被申请人' } : null,
    ].filter(Boolean) as Array<{ value: string; category: string }>,
  }
}
