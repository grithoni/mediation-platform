import { getDb } from '~/server/database'
import { cases, caseActivities } from '~/server/database/schema'
import { requireApiAuth } from '~/server/utils/api-auth'
import { eq, and, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  // API 认证
  const tenantId = await requireApiAuth(event)

  const caseId = getRouterParam(event, 'id')

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  const db = getDb()
  // 查询案件（确保属于同一租户）
  const caseData = await db
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)))
    .get()

  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 查询最近的活动日志
  const recentActivities = await db
    .select()
    .from(caseActivities)
    .where(eq(caseActivities.caseId, caseId))
    .orderBy(desc(caseActivities.createdAt))
    .limit(10)
    .all()

  return {
    success: true,
    data: {
      case: {
        id: caseData.id,
        title: caseData.title,
        description: caseData.description,
        disputeType: caseData.disputeType,
        amount: caseData.amount,
        partyAName: caseData.partyAName,
        partyBName: caseData.partyBName,
        phase: caseData.phase,
        status: caseData.status,
        mediatorId: caseData.mediatorId,
        createdAt: caseData.createdAt,
        updatedAt: caseData.updatedAt,
      },
      recentActivities: recentActivities.map((a) => ({
        type: a.activityType,
        description: a.description,
        performedByName: a.performedByName,
        createdAt: a.createdAt,
      })),
    },
  }
})
