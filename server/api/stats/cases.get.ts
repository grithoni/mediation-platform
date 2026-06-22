import { getDb } from '~/server/database'
import { cases } from '~/server/database/schema'
import { requireRole } from '~/server/middleware/auth'
import { and, gte, lte, count, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = requireRole(event, ['admin', 'case_manager'])

  const query = getQuery(event)
  const startDate = query.startDate ? new Date(query.startDate as string) : null
  const endDate = query.endDate ? new Date(query.endDate as string) : null
  const groupBy = (query.groupBy as string) || 'month' // month | disputeType | phase

  // 构建时间过滤条件
  const timeFilter = startDate && endDate
    ? and(gte(cases.createdAt, startDate), lte(cases.createdAt, endDate))
    : undefined

  // 按纠纷类型统计
  const byDisputeType = await db
    .select({
      disputeType: cases.disputeType,
      count: count(),
    })
    .from(cases)
    .where(timeFilter)
    .groupBy(cases.disputeType)
    .all()

  // 按月统计
  const byMonth = await db
    .select({
      month: sql<string>`strftime('%Y-%m', datetime(${cases.createdAt}, 'unixepoch'))`,
      count: count(),
    })
    .from(cases)
    .where(timeFilter)
    .groupBy(sql`strftime('%Y-%m', datetime(${cases.createdAt}, 'unixepoch'))`)
    .all()

  // 争议金额分布
  const amountRanges = [
    { min: 0, max: 10000, label: '1万以下' },
    { min: 10000, max: 50000, label: '1-5万' },
    { min: 50000, max: 100000, label: '5-10万' },
    { min: 100000, max: 500000, label: '10-50万' },
    { min: 500000, max: 1000000, label: '50-100万' },
    { min: 1000000, max: null, label: '100万以上' },
  ]

  const amountDistribution = []
  for (const range of amountRanges) {
    const filter = range.max
      ? and(timeFilter, gte(cases.amount, range.min), lte(cases.amount, range.max))
      : and(timeFilter, gte(cases.amount, range.min))

    const result = await db
      .select({ count: count() })
      .from(cases)
      .where(filter)
      .get()

    amountDistribution.push({
      range: range.label,
      count: result?.count || 0,
    })
  }

  return {
    success: true,
    data: {
      byDisputeType: byDisputeType.reduce((acc, item) => {
        acc[item.disputeType || '未分类'] = item.count
        return acc
      }, {} as Record<string, number>),
      byMonth: byMonth.map((item) => ({
        month: item.month,
        count: item.count,
      })),
      amountDistribution,
    },
  }
})
