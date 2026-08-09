// ============================================================
// 案件审计与代理执行记录工具
// - recordCaseEvent: 写 case_events 状态流转日志（幂等、安全）
// - createAgentRun / finishAgentRun: 代理执行生命周期记录
// 供 phase.put.ts / value-skills / chat 等统一调用
// ============================================================
import { v4 as uuidv4 } from 'uuid'
import { sql } from 'drizzle-orm'
import { getDb } from '../database'
import { caseEvents, caseTaskRuns } from '../database/schema'

export type EventSource = 'manual' | 'system' | 'agent'

export interface RecordCaseEventInput {
  caseId: string
  eventType: 'phase_changed' | 'status_changed' | 'case_created' | 'case_closed'
  fromPhase?: string | null
  toPhase?: string | null
  fromStatus?: string | null
  toStatus?: string | null
  actorId?: string | null
  actorName?: string | null
  source?: EventSource
  reason?: string
  metadata?: Record<string, unknown>
}

/** 写一条案件状态流转日志（失败静默，不影响主流程） */
export function recordCaseEvent(input: RecordCaseEventInput): void {
  try {
    const db = getDb()
    db.insert(caseEvents).values({
      id: uuidv4(),
      caseId: input.caseId,
      tenantId: null,
      eventType: input.eventType,
      fromPhase: input.fromPhase ?? null,
      toPhase: input.toPhase ?? null,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      source: input.source ?? 'system',
      reason: input.reason ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: Date.now(),
    }).run()
  } catch (err) {
    console.warn('[case-audit] recordCaseEvent failed:', err)
  }
}

export interface CreateAgentRunInput {
  caseId: string
  agentType: string
  planJson?: unknown
  inputContext?: string
  timeoutMs?: number
}

/** 创建一次代理执行记录，返回 runId */
export function createAgentRun(input: CreateAgentRunInput): string | null {
  try {
    const db = getDb()
    const id = uuidv4()
    db.insert(caseTaskRuns).values({
      id,
      caseId: input.caseId,
      tenantId: null,
      taskId: null,
      agentType: input.agentType,
      status: 'running',
      planJson: input.planJson ? JSON.stringify(input.planJson) : null,
      inputContext: input.inputContext ?? null,
      retrievalRefs: null,
      toolCalls: null,
      outputContent: null,
      reviewState: 'none',
      retryCount: 0,
      timeoutMs: input.timeoutMs ?? null,
      errorMessage: null,
      startedAt: Date.now(),
      finishedAt: null,
      createdAt: Date.now(),
    }).run()
    return id
  } catch (err) {
    console.warn('[case-audit] createAgentRun failed:', err)
    return null
  }
}

export interface FinishAgentRunInput {
  runId: string
  status: 'done' | 'failed' | 'cancelled'
  outputContent?: string | null
  retrievalRefs?: unknown[]
  toolCalls?: unknown[]
  errorMessage?: string | null
  /** 人工复核状态：none | pending | approved | rejected */
  reviewState?: string
}

/** 完成一次代理执行（写结果、引用、工具调用记录） */
export function finishAgentRun(input: FinishAgentRunInput): void {
  try {
    const db = getDb()
    db.update(caseTaskRuns).set({
      status: input.status,
      outputContent: input.outputContent ?? null,
      retrievalRefs: input.retrievalRefs ? JSON.stringify(input.retrievalRefs) : null,
      toolCalls: input.toolCalls ? JSON.stringify(input.toolCalls) : null,
      errorMessage: input.errorMessage ?? null,
      reviewState: input.reviewState ?? undefined,
      finishedAt: Date.now(),
    }).where(sql`id = ${input.runId}`).run()
  } catch (err) {
    console.warn('[case-audit] finishAgentRun failed:', err)
  }
}

export interface AppendEvalInput {
  runId: string
  /** 追加到 tool_calls 的 eval 记录 */
  evalRecord: Record<string, unknown>
  reviewState?: string
}

/** 异步评估完成后：向已有 agent_run 追加 eval 记录并更新复核状态 */
export function appendAgentRunEval(input: AppendEvalInput): void {
  try {
    const db = getDb()
    const run = db.select().from(caseTaskRuns).where(sql`id = ${input.runId}`).get()
    if (!run) return
    const prevCalls = run.toolCalls ? JSON.parse(run.toolCalls) : []
    const newCalls = [...(Array.isArray(prevCalls) ? prevCalls : []), input.evalRecord]
    db.update(caseTaskRuns).set({
      toolCalls: JSON.stringify(newCalls),
      reviewState: input.reviewState ?? run.reviewState ?? undefined,
    }).where(sql`id = ${input.runId}`).run()
  } catch (err) {
    console.warn('[case-audit] appendAgentRunEval failed:', err)
  }
}

/**
 * 评估阈值：
 *  - EVAL_LOW_SCORE_THRESHOLD: 归一化分低于此值标记为待人工复核（rejected）
 *  - EVAL_FLAG_HALLUCINATION: 出现幻觉时同样标记待复核
 */
export const EVAL_LOW_SCORE_THRESHOLD = 0.5
export const EVAL_FLAG_HALLUCINATION = true
