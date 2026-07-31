// ============================================================
// POST /api/cases/:caseNumber/claim-basis
// 请求权基础分析 — 缓存优先，已分析过直接返回
// ============================================================
import { getCachedAnalysis } from '../../../utils/analysis-cache'

export default defineEventHandler(async (event) => {
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  if (!caseNumber) throw createError({ statusCode: 400, message: '缺少案件编号' })

  const cached = getCachedAnalysis(caseNumber, 'claim_basis')
  if (cached) return { success: true, data: { caseId: caseNumber, content: cached, generatedAt: new Date().toISOString(), cached: true } }

  const { runAnalysis } = await import('../../../utils/analysis-core')
  const content = await runAnalysis(caseNumber, 'claim_basis')
  return { success: true, data: { caseId: caseNumber, content, generatedAt: new Date().toISOString() } }
})
