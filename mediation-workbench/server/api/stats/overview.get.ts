import { getDb } from '~/server/database'
import { cases, users, agreements, messages } from '~/server/database/schema'
import { requireRole } from '~/server/middleware/auth'
import { eq, and, gte, lte, count, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  // 需要管理员或案件管理员权限
  const user = requireRole(event, ['admin', 'case_manager'])
  const db = getDb()

  const query = getQuery(event)
  const startDate = query.startDate ? new Date(query.startDate as string).getTime() : null
  const endDate = query.endDate ? new Date(query.endDate as string).getTime() : null

  // 构建时间过滤条件
  const timeFilter = startDate && endDate
    ? and(gte(cases.createdAt, startDate), lte(cases.createdAt, endDate))
    : undefined

  // 总案件数
  const totalCasesResult = await db
    .select({ count: count() })
    .from(cases)
    .where(timeFilter)
    .get()
  const totalCases = totalCasesResult?.count || 0

  // 各状态案件数
  const statusCounts = await db
    .select({
      phase: cases.phase,
      count: count(),
    })
    .from(cases)
    .where(timeFilter)
    .groupBy(cases.phase)
    .all()

  // 成功结案数
  const successCases = statusCounts.find((s) => s.phase === 'closed_success')?.count || 0
  const failedCases = statusCounts.find((s) => s.phase === 'closed_failed')?.count || 0
  const withdrawnCases = statusCounts.find((s) => s.phase === 'withdrawn')?.count || 0

  // 调解成功率
  const closedCases = successCases + failedCases
  const successRate = closedCases > 0 ? (successCases / closedCases) * 100 : 0

  // 用户统计
  const totalUsersResult = await db
    .select({ count: count() })
    .from(users)
    .get()
  const totalUsers = totalUsersResult?.count || 0

  // 各角色用户数
  const roleCounts = await db
    .select({
      role: users.role,
      count: count(),
    })
    .from(users)
    .groupBy(users.role)
    .all()

  // 协议统计
  const totalAgreementsResult = await db
    .select({ count: count() })
    .from(agreements)
    .get()
  const totalAgreements = totalAgreementsResult?.count || 0

  // 已签署协议数
  const signedAgreementsResult = await db
    .select({ count: count() })
    .from(agreements)
    .where(eq(agreements.status, 'signed'))
    .get()
  const signedAgreements = signedAgreementsResult?.count || 0

  // 消息统计
  const totalMessagesResult = await db
    .select({ count: count() })
    .from(messages)
    .get()
  const totalMessages = totalMessagesResult?.count || 0

  return {
    success: true,
    data: {
      cases: {
        total: totalCases,
        byStatus: statusCounts.reduce((acc, s) => {
          acc[s.phase] = s.count
          return acc
        }, {} as Record<string, number>),
        successCases,
        failedCases,
        withdrawnCases,
        successRate: Math.round(successRate * 100) / 100,
      },
      users: {
        total: totalUsers,
        byRole: roleCounts.reduce((acc, r) => {
          acc[r.role] = r.count
          return acc
        }, {} as Record<string, number>),
      },
      agreements: {
        total: totalAgreements,
        signed: signedAgreements,
        signRate: totalAgreements > 0 ? Math.round((signedAgreements / totalAgreements) * 100 * 100) / 100 : 0,
      },
      messages: {
        total: totalMessages,
      },
    },
  }
})
