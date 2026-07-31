// POST /api/agent/analysis
// 外部 Agent（Hermes / WorkBuddy）写回接口骨架
// 鉴权：请求头 x-agent-token 需等于环境变量 AGENT_API_TOKEN
// Body: { caseId, agentAnalysis, materialChecklist, agentStatus? }
import { eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { caseDynamicFiles } from '../../database/schema'

const AGENT_TOKEN = process.env.AGENT_API_TOKEN || 'dev-agent-token'

export default defineEventHandler(async (event) => {
  // ── 鉴权 ──
  const token = getHeader(event, 'x-agent-token')
  if (token !== AGENT_TOKEN) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const caseId = body?.caseId
  if (!caseId) {
    throw createError({ statusCode: 400, statusMessage: 'caseId required' })
  }

  const db = getDb()
  const now = Date.now()

  // 查找是否已存在动态文件记录
  const existing = db
    .select()
    .from(caseDynamicFiles)
    .where(eq(caseDynamicFiles.caseId, caseId))
    .get()

  const patch = {
    agentAnalysis: body.agentAnalysis ?? null,
    materialChecklist: body.materialChecklist ?? null,
    agentStatus: body.agentStatus ?? 'done',
    agentUpdatedAt: now,
    updatedAt: now,
  }

  if (existing) {
    db.update(caseDynamicFiles)
      .set(patch)
      .where(eq(caseDynamicFiles.caseId, caseId))
      .run()
  } else {
    db.insert(caseDynamicFiles)
      .values({
        id: `cdf_${caseId}_${now}`,
        caseId,
        ...patch,
      })
      .run()
  }

  return { success: true, data: { caseId, agentStatus: patch.agentStatus } }
})
