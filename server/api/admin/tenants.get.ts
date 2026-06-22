import { getDb } from '~/server/database'
import { tenants } from '~/server/database/schema'
import { requireAdmin } from '~/server/middleware/auth'

export default defineEventHandler(async (event) => {
  // 需要管理员权限
  requireAdmin(event)

  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const pageSize = parseInt(query.pageSize as string) || 20
  const search = query.search as string

  // 构建查询
  let whereClause = undefined

  // 执行查询
  const db = getDb()
  const allTenants = await db.select().from(tenants).all()

  // 搜索过滤
  let filtered = allTenants
  if (search) {
    const searchLower = search.toLowerCase()
    filtered = allTenants.filter(
      (t) =>
        t.name.toLowerCase().includes(searchLower) ||
        t.slug.toLowerCase().includes(searchLower) ||
        t.contactEmail?.toLowerCase().includes(searchLower)
    )
  }

  // 分页
  const total = filtered.length
  const items = filtered.slice((page - 1) * pageSize, page * pageSize)

  return {
    success: true,
    data: {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  }
})
