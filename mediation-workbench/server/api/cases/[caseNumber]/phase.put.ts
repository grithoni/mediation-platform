import { eq } from 'drizzle-orm'
import { getDb } from '~/server/database'
import { cases, caseActivities } from '~/server/database/schema'
import { requireMediator } from '~/server/middleware/auth'
import { CaseStatus, CaseStatusLabels, type CaseStatusType } from '~/server/utils/case-status'
import { recordCaseEvent } from '~/server/utils/case-audit'
import { v4 as uuidv4 } from 'uuid'

// ============================================================
// 调解员手动设置案件状态
// 状态不强制流转，均可由调解员直接切换（可前进、可回退、可跳过）
// ============================================================
export default defineEventHandler(async (event) => {
  const user = requireMediator(event)
  const caseId = getRouterParam(event, 'caseNumber')
  const body = await readBody(event)
  const { phase } = body

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  const validPhases = Object.values(CaseStatus) as string[]
  if (!phase || !validPhases.includes(phase)) {
    throw createError({ statusCode: 400, message: `无效的案件状态，可选：${validPhases.join(' / ')}` })
  }

  const db = getDb()
  const caseData = await db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  const now = Date.now()
  const nextPhase = phase as CaseStatusType
  const isClosed = nextPhase === CaseStatus.WITHDRAWN

  await db.update(cases).set({
    phase: nextPhase,
    status: isClosed ? 'closed' : 'active',
    closedAt: isClosed ? now : caseData.closedAt,
    closeReason: isClosed ? '调解员撤回' : caseData.closeReason,
    updatedAt: now,
  }).where(eq(cases.id, caseId)).run()

  // 记录活动
  await db.insert(caseActivities).values({
    id: uuidv4(),
    caseId,
    activityType: 'phase_changed',
    description: `调解员将案件状态调整为「${CaseStatusLabels[nextPhase]}」`,
    performedBy: user.userId,
    performedByName: user.name,
    metadata: JSON.stringify({ from: caseData.phase, to: nextPhase }),
    createdAt: now,
  }).run()

  // 写入状态流转日志（审计）
  recordCaseEvent({
    caseId,
    eventType: 'phase_changed',
    fromPhase: caseData.phase,
    toPhase: nextPhase,
    fromStatus: caseData.status,
    toStatus: isClosed ? 'closed' : 'active',
    actorId: user.userId,
    actorName: user.name,
    source: 'manual',
    reason: '调解员手动切换',
    metadata: { phaseLabel: CaseStatusLabels[nextPhase] },
  })

  return {
    success: true,
    data: { caseId, phase: nextPhase, status: isClosed ? 'closed' : 'active' },
  }
})
