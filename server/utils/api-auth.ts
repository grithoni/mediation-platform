/**
 * API 认证工具
 * 支持 API Key 认证和 OAuth 2.0
 */

import { getDb } from '~/server/database'
import { tenants } from '~/server/database/schema'
import { eq } from 'drizzle-orm'

export interface ApiAuthResult {
  valid: boolean
  tenantId?: string
  error?: string
}

/**
 * 验证 API Key
 */
export async function validateApiKey(apiKey: string): Promise<ApiAuthResult> {
  if (!apiKey) {
    return { valid: false, error: 'API Key 不能为空' }
  }

  const db = getDb()
  // 从数据库查询 API Key 对应的租户
  // 注意：实际项目中应该有专门的 api_keys 表
  // 这里简化处理，使用租户表的 slug 作为 API Key
  const tenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, apiKey))
    .get()

  if (!tenant) {
    return { valid: false, error: '无效的 API Key' }
  }

  if (!tenant.isActive) {
    return { valid: false, error: '租户已被禁用' }
  }

  return {
    valid: true,
    tenantId: tenant.id,
  }
}

/**
 * 从请求头中提取 API Key
 */
export function extractApiKey(event: any): string | null {
  // 从 Authorization header 获取
  const authHeader = getRequestHeader(event, 'authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // 从 X-API-Key header 获取
  const apiKeyHeader = getRequestHeader(event, 'x-api-key')
  if (apiKeyHeader) {
    return apiKeyHeader
  }

  // 从 query 参数获取
  const query = getQuery(event)
  if (query.api_key) {
    return query.api_key as string
  }

  return null
}

/**
 * API 认证中间件
 */
export async function requireApiAuth(event: any): Promise<string> {
  const apiKey = extractApiKey(event)

  if (!apiKey) {
    throw createError({
      statusCode: 401,
      message: '请提供有效的 API Key',
    })
  }

  const result = await validateApiKey(apiKey)

  if (!result.valid) {
    throw createError({
      statusCode: 401,
      message: result.error || 'API 认证失败',
    })
  }

  return result.tenantId!
}

/**
 * 生成 API Key
 */
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
