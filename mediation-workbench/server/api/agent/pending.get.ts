// GET /api/agent/pending
// 外部 Agent 轮询接口骨架：返回 agentStatus = 'pending' 的案件列表
// 鉴权：请求头 x-agent-token 需等于环境变量 AGENT_API_TOKEN
import { eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { caseDynamicFiles, cases } from '../../database/schema'

const AGENT_TOKEN = process.env.AGENT_API_TOKEN || 'dev-agent-token'

export default defineEventHandler(async (event) => {
  // ── 鉴权 ──
  const token = getHeader(event, 'x-agent-token')
  if (token !== AGENT_TOKEN) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const db = getDb()

  // 关联案件基本信息，便于 agent 取上下文
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

  return { success: true, data: pending }
})
