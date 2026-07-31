import { getDb } from '~/server/database'
import { caseActivities, cases } from '~/server/database/schema'
import { eq, desc } from 'drizzle-orm'
import { requireAuth } from '~/server/middleware/auth'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const caseId = getRouterParam(event, 'caseNumber')

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  // 验证案件存在
  const db = getDb()
  const caseData = await db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 权限检查
  const allowedRoles = ['admin', 'case_manager', 'mediator']
  const isPartyA = caseData.partyAUserId === user.userId
  const isPartyB = caseData.partyBUserId === user.userId

  if (!allowedRoles.includes(user.role) && !isPartyA && !isPartyB) {
    throw createError({ statusCode: 403, message: '权限不足' })
  }

  // 查询活动日志
  const activities = await db
    .select()
    .from(caseActivities)
    .where(eq(caseActivities.caseId, caseId))
    .orderBy(desc(caseActivities.createdAt))
    .all()

  // 格式化活动日志
  const timeline = activities.map((activity) => ({
    id: activity.id,
    type: activity.activityType,
    description: activity.description,
    performedBy: activity.performedBy,
    performedByName: activity.performedByName,
    relatedId: activity.relatedId,
    relatedType: activity.relatedType,
    metadata: activity.metadata ? JSON.parse(activity.metadata) : null,
    createdAt: activity.createdAt,
  }))

  return {
    success: true,
    data: {
      caseId,
      timeline,
      total: timeline.length,
    },
  }
})
