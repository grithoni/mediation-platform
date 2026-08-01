// ============================================================
// server/utils/analysis-core.ts
// AI 分析统一入口 — 强制走本地脱敏 + 云端 skills + 反脱敏主流程
// ============================================================
import { getCachedAnalysis, saveAnalysis } from './analysis-cache'
import { runStructuredWorkflowAnalysis } from './case-analysis-orchestrator'

export type WorkflowAnalysisContentType = 'claim_basis' | 'anticipate_defense' | 'evidence_checklist' | 'recommend_solution'

export async function runAnalysis(caseNumber: string, type: WorkflowAnalysisContentType): Promise<string> {
  const cached = getCachedAnalysis(caseNumber, type)
  if (cached) return cached

  const content = await runStructuredWorkflowAnalysis(caseNumber, type)
  if (content && content.length > 100) {
    saveAnalysis(caseNumber, type, content)
  }
  return content
}
