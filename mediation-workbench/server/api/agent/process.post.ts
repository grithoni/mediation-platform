// POST /api/agent/process
// 内部或外部调解智能体触发单案自动分析
// 鉴权：请求头 x-agent-token 需等于环境变量 AGENT_API_TOKEN
// Body: { caseId }
import { runMediationBackgroundAnalysis } from '../../utils/mediation-agent'

const AGENT_TOKEN = process.env.AGENT_API_TOKEN || 'dev-agent-token'

export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'x-agent-token')
  if (token !== AGENT_TOKEN) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const caseId = body?.caseId
  if (!caseId) {
    throw createError({ statusCode: 400, statusMessage: 'caseId required' })
  }

  const result = await runMediationBackgroundAnalysis(caseId)
  return {
    success: true,
    data: result,
  }
})
