import { getDb } from '~/server/database'
import { cases, users, mediators } from '~/server/database/schema'
import { requireRole } from '~/server/middleware/auth'
import { eq, count, sql, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = requireRole(event, ['admin', 'case_manager'])

  // 调解员案件统计
  const mediatorStats = await db
    .select({
      mediatorId: cases.mediatorId,
      totalCases: count(),
      successCases: sql<number>`SUM(CASE WHEN ${cases.phase} = 'closed_success' THEN 1 ELSE 0 END)`,
      failedCases: sql<number>`SUM(CASE WHEN ${cases.phase} = 'closed_failed' THEN 1 ELSE 0 END)`,
      activeCases: sql<number>`SUM(CASE WHEN ${cases.phase} IN ('mediating', 'caucus', 'negotiating') THEN 1 ELSE 0 END)`,
    })
    .from(cases)
    .where(eq(cases.mediatorId, cases.mediatorId)) // 非空 mediatorId
    .groupBy(cases.mediatorId)
    .all()

  // 获取调解员详细信息
  const mediatorDetails = await Promise.all(
    mediatorStats.map(async (stat) => {
      if (!stat.mediatorId) return null

      const mediator = await db
        .select()
        .from(users)
        .where(eq(users.id, stat.mediatorId))
        .get()

      if (!mediator) return null

      const totalClosed = (stat.successCases || 0) + (stat.failedCases || 0)
      const successRate = totalClosed > 0
        ? Math.round(((stat.successCases || 0) / totalClosed) * 100 * 100) / 100
        : 0

      return {
        id: mediator.id,
        name: mediator.name,
        username: mediator.username,
        stats: {
          totalCases: stat.totalCases || 0,
          successCases: stat.successCases || 0,
          failedCases: stat.failedCases || 0,
          activeCases: stat.activeCases || 0,
          successRate,
        },
      }
    })
  )

  // 过滤掉 null 并按案件数排序
  const validMediators = mediatorDetails
    .filter(Boolean)
    .sort((a, b) => (b?.stats.totalCases || 0) - (a?.stats.totalCases || 0))

  // 总体统计
  const totalStats = {
    totalMediators: validMediators.length,
    totalCases: validMediators.reduce((sum, m) => sum + (m?.stats.totalCases || 0), 0),
    totalSuccessCases: validMediators.reduce((sum, m) => sum + (m?.stats.successCases || 0), 0),
    totalFailedCases: validMediators.reduce((sum, m) => sum + (m?.stats.failedCases || 0), 0),
    totalActiveCases: validMediators.reduce((sum, m) => sum + (m?.stats.activeCases || 0), 0),
    averageSuccessRate: validMediators.length > 0
      ? Math.round(
          validMediators.reduce((sum, m) => sum + (m?.stats.successRate || 0), 0) / validMediators.length * 100
        ) / 100
      : 0,
  }

  return {
    success: true,
    data: {
      mediators: validMediators,
      totalStats,
    },
  }
})
