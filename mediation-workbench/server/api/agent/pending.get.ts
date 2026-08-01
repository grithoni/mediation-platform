// GET /api/agent/pending
// 外部 Agent 轮询接口骨架：返回 agentStatus = 'pending' 的案件列表
// 鉴权：请求头 x-agent-token 需等于环境变量 AGENT_API_TOKEN
import { getDb } from '../../database'
import { claimPendingAgentCases } from '../../utils/agent/capabilities'
import { runMediationBackgroundAnalysis } from '../../utils/mediation-agent'

const AGENT_TOKEN = process.env.AGENT_API_TOKEN || 'dev-agent-token'

export default defineEventHandler(async (event) => {
  // ── 鉴权 ──
  const token = getHeader(event, 'x-agent-token')
  if (token !== AGENT_TOKEN) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const db = getDb()
  const pending = claimPendingAgentCases(db)
  const autoRun = getQuery(event).autoRun === '1'

  if (autoRun) {
    for (const item of pending) {
      runMediationBackgroundAnalysis(item.caseId).catch((error) => {
        console.error(`[agent/pending] autoRun failed for ${item.caseId}:`, error)
      })
    }
  }

  return { success: true, data: pending, autoRunStarted: autoRun ? pending.map(item => item.caseId) : [] }
})
