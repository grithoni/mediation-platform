import { getDb } from '~/server/database'
import { cases, caseActivities, users } from '~/server/database/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '~/server/middleware/auth'
import { CaseStatusLabels } from '~/server/utils/case-status'
import { v4 as uuidv4 } from 'uuid'

export default defineEventHandler(async (event) => {
  // 只有案件管理员和管理员可以分配调解员
  const user = requireRole(event, ['case_manager', 'admin'])
  const caseId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  const { mediatorId } = body

  if (!mediatorId) {
    throw createError({ statusCode: 400, message: '调解员ID不能为空' })
  }

  // 查询案件
  const db = getDb()
  const caseData = await db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 验证案件状态
  const allowedPhases = ['accepted', 'screening']
  if (!allowedPhases.includes(caseData.phase)) {
    throw createError({
      statusCode: 400,
      message: `当前案件状态为 "${CaseStatusLabels[caseData.phase as keyof typeof CaseStatusLabels]}"，无法分配调解员`,
    })
  }

  // 验证调解员存在
  const mediator = await db.select().from(users).where(eq(users.id, mediatorId)).get()
  if (!mediator) {
    throw createError({ statusCode: 404, message: '调解员不存在' })
  }

  // 验证调解员角色
  if (!['mediator', 'admin'].includes(mediator.role)) {
    throw createError({ statusCode: 400, message: '指定用户不是调解员' })
  }

  const now = new Date()

  // 更新案件
  await db.update(cases).set({
    mediatorId,
    mediatorBoundAt: now,
    phase: 'mediating',
    status: 'active',
    updatedAt: now,
  }).where(eq(cases.id, caseId)).run()

  // 记录活动
  await db.insert(caseActivities).values({
    id: uuidv4(),
    caseId,
    activityType: 'mediator_assigned',
    description: `调解员 "${mediator.name}" 已分配到本案`,
    performedBy: user.userId,
    performedByName: user.name,
    relatedId: mediatorId,
    relatedType: 'mediator',
    metadata: JSON.stringify({ mediatorId, mediatorName: mediator.name }),
    createdAt: now,
  })

  return {
    success: true,
    data: {
      caseId,
      mediatorId,
      mediatorName: mediator.name,
      assignedAt: now,
    },
    message: `调解员 "${mediator.name}" 分配成功`,
  }
})
