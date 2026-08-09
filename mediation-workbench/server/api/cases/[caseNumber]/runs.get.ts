import { desc, eq } from 'drizzle-orm'
import { getDb } from '~/server/database'
import { caseTaskRuns } from '~/server/database/schema'
import { requireMediator } from '~/server/middleware/auth'

// ============================================================
// 案件代理执行记录列表
// 返回该案件所有 agent_run（含检索引用来源），供审计与回放
// ============================================================
export default defineEventHandler(async (event) => {
  requireMediator(event)
  const caseId = getRouterParam(event, 'caseNumber')
  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  const db = getDb()
  const runs = db
    .select()
    .from(caseTaskRuns)
    .where(eq(caseTaskRuns.caseId, caseId))
    .orderBy(desc(caseTaskRuns.createdAt))
    .limit(50)
    .all()

  return {
    success: true,
    data: runs.map((r) => ({
      id: r.id,
      agentType: r.agentType,
      status: r.status,
      planJson: r.planJson ? safeParse(r.planJson) : null,
      inputContext: r.inputContext,
      retrievalRefs: r.retrievalRefs ? safeParse(r.retrievalRefs) : [],
      toolCalls: r.toolCalls ? safeParse(r.toolCalls) : [],
      outputContent: r.outputContent,
      reviewState: r.reviewState,
      errorMessage: r.errorMessage,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    })),
  }
})

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}
