import { getDb } from '~/server/database'
import { cases, caseActivities } from '~/server/database/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '~/server/middleware/auth'
import { CaseStatusLabels } from '~/server/utils/case-status'
import { v4 as uuidv4 } from 'uuid'

export default defineEventHandler(async (event) => {
  // 只有案件管理员和管理员可以审核案件
  const user = requireRole(event, ['case_manager', 'admin'])
  const caseId = getRouterParam(event, 'caseNumber')
  const body = await readBody(event)

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  const { action, reason } = body

  if (!action || !['approve', 'reject'].includes(action)) {
    throw createError({ statusCode: 400, message: '审核操作无效，必须为 approve 或 reject' })
  }

  // 查询案件
  const db = getDb()
  const caseData = await db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 只有审核中的案件可以审核
  if (caseData.phase !== 'reviewing' && caseData.phase !== 'intake') {
    throw createError({
      statusCode: 400,
      message: `当前案件状态为 "${CaseStatusLabels[caseData.phase as keyof typeof CaseStatusLabels]}"，无法审核`,
    })
  }

  const now = Date.now()

  if (action === 'approve') {
    // 审核通过 -> 进入预评估
    await db.update(cases).set({
      phase: 'screening',
      reviewedBy: user.userId,
      reviewedAt: now,
      reviewNote: reason || null,
      updatedAt: now,
    }).where(eq(cases.id, caseId)).run()

    // 记录活动
    await db.insert(caseActivities).values({
      id: uuidv4(),
      caseId,
      activityType: 'review_completed',
      description: `案件审核通过${reason ? `，备注：${reason}` : ''}`,
      performedBy: user.userId,
      performedByName: user.name,
      metadata: JSON.stringify({ action: 'approve', reason }),
      createdAt: now,
    })

    return {
      success: true,
      message: '案件审核通过，已进入预评估阶段',
    }
  } else {
    // 审核驳回 -> 撤回
    await db.update(cases).set({
      phase: 'withdrawn',
      status: 'closed',
      reviewedBy: user.userId,
      reviewedAt: now,
      reviewNote: reason || '审核驳回',
      closedAt: now,
      closeReason: reason || '审核驳回',
      updatedAt: now,
    }).where(eq(cases.id, caseId)).run()

    // 记录活动
    await db.insert(caseActivities).values({
      id: uuidv4(),
      caseId,
      activityType: 'review_completed',
      description: `案件审核驳回${reason ? `，原因：${reason}` : ''}`,
      performedBy: user.userId,
      performedByName: user.name,
      metadata: JSON.stringify({ action: 'reject', reason }),
      createdAt: now,
    })

    return {
      success: true,
      message: '案件已驳回',
    }
  }
})
