/**
 * Webhook 服务
 * 负责发送 Webhook 通知和管理重试
 */

import { getDb } from '~/server/database'
import { webhooks, webhookLogs } from '~/server/database/schema'
import { eq, and } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

export type WebhookEventType =
  | 'case.created'
  | 'case.status_changed'
  | 'case.assigned'
  | 'agreement.created'
  | 'agreement.approved'
  | 'agreement.signed'
  | 'case.closed'

export interface WebhookPayload {
  event: WebhookEventType
  timestamp: string
  data: Record<string, any>
}

/**
 * 生成 Webhook 签名
 */
function generateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
}

/**
 * 发送 Webhook 通知
 */
export async function sendWebhookNotification(
  tenantId: string,
  event: WebhookEventType,
  data: Record<string, any>
): Promise<void> {
  const db = getDb()
  // 查询该租户的所有活跃 Webhook
  const activeWebhooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.tenantId, tenantId), eq(webhooks.isActive, true)))
    .all()

  // 过滤出订阅了该事件的 Webhook
  const targetWebhooks = activeWebhooks.filter((wh) => {
    const events = JSON.parse(wh.events) as string[]
    return events.includes(event)
  })

  if (targetWebhooks.length === 0) {
    return
  }

  // 构建 payload
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  }

  const payloadString = JSON.stringify(payload)

  // 发送通知
  for (const webhook of targetWebhooks) {
    await sendSingleWebhook(webhook, payloadString)
  }
}

/**
 * 发送单个 Webhook
 */
async function sendSingleWebhook(
  webhook: any,
  payload: string
): Promise<void> {
  const db = getDb()
  const logId = uuidv4()
  const now = Date.now()

  try {
    // 生成签名
    const signature = webhook.secret
      ? generateSignature(payload, webhook.secret)
      : undefined

    // 发送请求
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature || '',
        'User-Agent': 'MediationPlatform-Webhook/1.0',
      },
      body: payload,
      signal: AbortSignal.timeout(10000), // 10秒超时
    })

    const responseBody = await response.text()

    // 记录日志
    await db.insert(webhookLogs).values({
      id: logId,
      webhookId: webhook.id,
      eventType: JSON.parse(payload).event,
      payload,
      statusCode: response.status,
      responseBody: responseBody.substring(0, 1000), // 限制长度
      success: response.ok,
      retryCount: 0,
      createdAt: now,
    })

    // 更新 Webhook 统计
    await db
      .update(webhooks)
      .set({
        lastTriggeredAt: now,
        failureCount: response.ok ? 0 : webhook.failureCount + 1,
        updatedAt: now,
      })
      .where(eq(webhooks.id, webhook.id))
      .run()

    // 如果失败且需要重试
    if (!response.ok && webhook.failureCount < 3) {
      // 可以在这里添加重试逻辑
      console.error(`Webhook ${webhook.id} failed with status ${response.status}`)
    }
  } catch (error: any) {
    // 记录错误日志
    await db.insert(webhookLogs).values({
      id: logId,
      webhookId: webhook.id,
      eventType: JSON.parse(payload).event,
      payload,
      success: false,
      errorMessage: error.message,
      retryCount: 0,
      createdAt: now,
    })

    // 更新失败计数
    await db
      .update(webhooks)
      .set({
        failureCount: webhook.failureCount + 1,
        updatedAt: now,
      })
      .where(eq(webhooks.id, webhook.id))
      .run()
  }
}

/**
 * 重试失败的 Webhook
 */
export async function retryFailedWebhooks(): Promise<void> {
  const db = getDb()
  // 查询需要重试的 Webhook 日志
  const failedLogs = await db
    .select()
    .from(webhookLogs)
    .where(eq(webhookLogs.success, false))
    .all()

  for (const log of failedLogs) {
    if ((log.retryCount ?? 0) >= 3) continue

    const webhook = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, log.webhookId))
      .get()

    if (!webhook || !webhook.isActive) continue

    // 重试
    await sendSingleWebhook(webhook, log.payload)

    // 更新重试次数
    await db
      .update(webhookLogs)
      .set({ retryCount: (log.retryCount ?? 0) + 1 })
      .where(eq(webhookLogs.id, log.id))
      .run()
  }
}
