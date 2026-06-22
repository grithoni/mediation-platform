import { getDb } from '~/server/database'
import { webhooks } from '~/server/database/schema'
import { requireAdmin } from '~/server/middleware/auth'
import { v4 as uuidv4 } from 'uuid'

export default defineEventHandler(async (event) => {
  // 需要管理员权限
  const user = requireAdmin(event)

  const body = await readBody(event)

  const { tenantId, url, secret, events } = body

  // 验证必填字段
  if (!tenantId || !url || !events || !Array.isArray(events)) {
    throw createError({
      statusCode: 400,
      message: '租户ID、URL 和事件列表为必填项',
    })
  }

  // 验证 URL 格式
  try {
    new URL(url)
  } catch {
    throw createError({
      statusCode: 400,
      message: 'URL 格式无效',
    })
  }

  // 验证事件类型
  const validEvents = [
    'case.created',
    'case.status_changed',
    'case.assigned',
    'agreement.created',
    'agreement.approved',
    'agreement.signed',
    'case.closed',
  ]

  const invalidEvents = events.filter((e: string) => !validEvents.includes(e))
  if (invalidEvents.length > 0) {
    throw createError({
      statusCode: 400,
      message: `无效的事件类型: ${invalidEvents.join(', ')}`,
    })
  }

  const webhookId = uuidv4()
  const now = new Date()

  // 创建 Webhook
  const db = getDb()
  await db.insert(webhooks).values({
    id: webhookId,
    tenantId,
    url,
    secret: secret || null,
    events: JSON.stringify(events),
    isActive: true,
    failureCount: 0,
    createdAt: now,
    updatedAt: now,
  })

  return {
    success: true,
    data: {
      webhook: {
        id: webhookId,
        tenantId,
        url,
        events,
        isActive: true,
        failureCount: 0,
        createdAt: now,
      },
    },
    message: 'Webhook 创建成功',
  }
})
