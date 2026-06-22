import { getDb } from '~/server/database'
import { webhooks } from '~/server/database/schema'
import { requireAdmin } from '~/server/middleware/auth'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  // 需要管理员权限
  const user = requireAdmin(event)

  const query = getQuery(event)
  const tenantId = query.tenantId as string

  // 构建查询
  let webhookList
  if (tenantId) {
    webhookList = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.tenantId, tenantId))
      .all()
  } else {
  const db = getDb()
    webhookList = await db.select().from(webhooks).all()
  }

  return {
    success: true,
    data: {
      webhooks: webhookList.map((wh) => ({
        id: wh.id,
        tenantId: wh.tenantId,
        url: wh.url,
        events: JSON.parse(wh.events),
        isActive: wh.isActive,
        lastTriggeredAt: wh.lastTriggeredAt,
        failureCount: wh.failureCount,
        createdAt: wh.createdAt,
        updatedAt: wh.updatedAt,
      })),
      total: webhookList.length,
    },
  }
})
