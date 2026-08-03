import { and, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { caseDynamicFiles, cases } from '../../database/schema'

const ENABLED_AGENT_TOOL_NAMES = [
  'ask_user',
  'update_working_checkpoint',
  'search_legal_knowledge',
  'read_dynamic_file',
  'update_dynamic_file',
  'search_information',
  'file_read',
  'read_docx',
  'file_patch',
  'file_write',
  'query_case_materials',
  'desensitize_case_materials',
  'analyze_with_mediation_skills',
  'restore_analysis_result',
  'writeback_case_analysis',
] as const

export function getAgentEnabledToolNames(): string[] {
  return [...ENABLED_AGENT_TOOL_NAMES]
}

export function filterAgentTools<T extends { function?: { name?: string } }>(tools: T[]): T[] {
  const allowed = new Set(ENABLED_AGENT_TOOL_NAMES)
  return tools.filter((tool) => {
    const name = tool.function?.name
    return !!name && allowed.has(name as (typeof ENABLED_AGENT_TOOL_NAMES)[number])
  })
}

export interface PendingAgentCase {
  caseId: string
  agentStatus: string
  dialogTurnCount: number | null
  dialogEnded: boolean | null
  title: string
  partyAName: string
  partyBName: string
  description: string | null
}

export function claimPendingAgentCases(
  db: BetterSQLite3Database<Record<string, unknown>>,
  options: {
    limit?: number
    now?: number
  } = {},
): PendingAgentCase[] {
  const now = options.now ?? Date.now()
  const limit = options.limit ?? 20

  const pending = db
    .select({
      caseId: caseDynamicFiles.caseId,
      agentStatus: caseDynamicFiles.agentStatus,
      dialogTurnCount: caseDynamicFiles.dialogTurnCount,
      dialogEnded: caseDynamicFiles.dialogEnded,
      title: cases.title,
      partyAName: cases.partyAName,
      partyBName: cases.partyBName,
      description: cases.description,
    })
    .from(caseDynamicFiles)
    .innerJoin(cases, eq(caseDynamicFiles.caseId, cases.id))
    .where(eq(caseDynamicFiles.agentStatus, 'pending'))
    .all()
    .slice(0, limit)

  for (const row of pending) {
    db.update(caseDynamicFiles)
      .set({
        agentStatus: 'processing',
        agentUpdatedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(caseDynamicFiles.caseId, row.caseId),
        eq(caseDynamicFiles.agentStatus, 'pending'),
      ))
      .run()
  }

  return pending.map((row) => ({
    ...row,
    agentStatus: 'processing',
  }))
}
