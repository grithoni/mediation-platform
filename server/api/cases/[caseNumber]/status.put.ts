import { getDb } from '~/server/database'
import { cases, caseActivities } from '~/server/database/schema'
import { eq } from 'drizzle-orm'
import { requireAuth } from '~/server/middleware/auth'
import { isValidTransition, CaseStatusLabels, type CaseStatusType } from '~/server/utils/case-status'
import { v4 as uuidv4 } from 'uuid'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const caseId = getRouterParam(event, 'caseNumber')
  const body = await readBody(event)

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  const { status: newStatus, reason } = body

  if (!newStatus) {
    throw createError({ statusCode: 400, message: '目标状态不能为空' })
  }

  // 查询案件
  const db = getDb()
  const caseData = await db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 验证状态流转
  const currentStatus = caseData.phase as CaseStatusType
  if (!isValidTransition(currentStatus, newStatus as CaseStatusType)) {
    throw createError({
      statusCode: 400,
      message: `不允许从 "${CaseStatusLabels[currentStatus]}" 流转到 "${CaseStatusLabels[newStatus as CaseStatusType]}"`,
    })
  }

  // 权限检查
  const allowedRoles = ['admin', 'case_manager', 'mediator']
  if (!allowedRoles.includes(user.role)) {
    // 申请人只能撤回自己的案件
    if (user.role === 'claimant' && newStatus === 'withdrawn') {
      // 验证是否是案件申请人
      if (caseData.partyAUserId !== user.userId) {
        throw createError({ statusCode: 403, message: '只有申请人可以撤回案件' })
      }
    } else {
      throw createError({ statusCode: 403, message: '权限不足' })
    }
  }

  // 更新案件状态
  const now = new Date()
  const updateData: any = {
    phase: newStatus,
    updatedAt: now,
  }

  // 根据状态设置额外字段
  if (newStatus === 'closed_success' || newStatus === 'closed_failed') {
    updateData.status = 'closed'
    updateData.closedAt = now
    updateData.closeReason = reason || null
  } else if (newStatus === 'withdrawn') {
    updateData.status = 'closed'
    updateData.closedAt = now
    updateData.closeReason = '当事人撤回'
  } else if (newStatus === 'accepted') {
    updateData.status = 'active'
  }

  await db.update(cases).set(updateData).where(eq(cases.id, caseId)).run()

  // 记录活动日志
  await db.insert(caseActivities).values({
    id: uuidv4(),
    caseId,
    activityType: 'status_changed',
    description: `案件状态从 "${CaseStatusLabels[currentStatus]}" 变更为 "${CaseStatusLabels[newStatus as CaseStatusType]}"${reason ? `，原因：${reason}` : ''}`,
    performedBy: user.userId,
    performedByName: user.name,
    metadata: JSON.stringify({
      fromStatus: currentStatus,
      toStatus: newStatus,
      reason,
    }),
    createdAt: now,
  })

  return {
    success: true,
    data: {
      caseId,
      previousStatus: currentStatus,
      currentStatus: newStatus,
      statusLabel: CaseStatusLabels[newStatus as CaseStatusType],
    },
    message: '案件状态更新成功',
  }
})
