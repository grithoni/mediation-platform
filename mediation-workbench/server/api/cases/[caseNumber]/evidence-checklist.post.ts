// ============================================================
// POST /api/cases/:caseNumber/evidence-checklist
// 证据清单 — 缓存优先
// ============================================================
import { getCachedAnalysis } from '../../../utils/analysis-cache'

export default defineEventHandler(async (event) => {
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  if (!caseNumber) throw createError({ statusCode: 400, message: '缺少案件编号' })

  const cached = getCachedAnalysis(caseNumber, 'evidence_checklist')
  if (cached) return { success: true, data: { caseId: caseNumber, content: cached, generatedAt: new Date().toISOString(), cached: true } }

  const { runAnalysis } = await import('../../../utils/analysis-core')
  const content = await runAnalysis(caseNumber, 'evidence_checklist')
  return { success: true, data: { caseId: caseNumber, content, generatedAt: new Date().toISOString() } }
})
