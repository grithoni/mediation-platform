import { getDb } from '~/server/database'
import { agreements, cases } from '~/server/database/schema'
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

  // 查询协议列表
  const agreementList = await db
    .select()
    .from(agreements)
    .where(eq(agreements.caseId, caseId))
    .orderBy(desc(agreements.createdAt))
    .all()

  return {
    success: true,
    data: {
      caseId,
      agreements: agreementList.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        performancePlan: a.performancePlan ? JSON.parse(a.performancePlan) : null,
        breachClauses: a.breachClauses ? JSON.parse(a.breachClauses) : null,
        status: a.status,
        version: a.version,
        isAiGenerated: a.isAiGenerated,
        approvedByPartyA: a.approvedByPartyA,
        approvedByPartyB: a.approvedByPartyB,
        approvedAt: a.approvedAt,
        createdBy: a.createdBy,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      total: agreementList.length,
    },
  }
})
