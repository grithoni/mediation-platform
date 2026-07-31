import type { H3Event } from 'h3'
import { getDb } from '~/server/database'
import { tenants } from '~/server/database/schema'
import { eq } from 'drizzle-orm'

/**
 * 租户上下文接口
 */
export interface TenantContext {
  id: string
  name: string
  slug: string
  logo: string | null
  primaryColor: string
  aiModel: string
  aiEnabled: boolean
  maxCases: number
  maxStorageMb: number
  maxApiCalls: number
}

/**
 * 从请求中提取租户标识
 * 支持三种方式：
 * 1. Header: X-Tenant-ID
 * 2. Query: ?tenant=slug
 * 3. Subdomain: xxx.platform.com
 */
function extractTenantIdentifier(event: H3Event): string | null {
  // 1. 从 Header 获取
  const headerTenant = getRequestHeader(event, 'x-tenant-id')
  if (headerTenant) return headerTenant

  // 2. 从 Query 获取
  const query = getQuery(event)
  if (query.tenant) return query.tenant as string

  // 3. 从 Host 获取子域名
  const host = getRequestHeader(event, 'host')
  if (host) {
    const hostname = host.split(':')[0] ?? '' // strip port
    // Skip bare IP addresses (e.g. 192.168.1.1 or ::1)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname === 'localhost' || hostname.includes(':')) {
      // noop — IP / localhost / IPv6, not a subdomain
    } else {
      const parts = hostname.split('.')
      if (parts.length > 2 && !['www', 'api'].includes(parts[0] ?? '')) {
        return parts[0] ?? null
      }
    }
  }

  return null
}

/**
 * 获取租户上下文（带缓存）
 */
const tenantCache = new Map<string, { tenant: TenantContext; cachedAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟

async function getTenantByIdentifier(identifier: string): Promise<TenantContext | null> {
  // 检查缓存
  const cached = tenantCache.get(identifier)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.tenant
  }

  // 从数据库查询（支持 ID 或 slug）
  const db = getDb()
  let tenant = await db.select().from(tenants).where(eq(tenants.id, identifier)).get()
  if (!tenant) {
    tenant = await db.select().from(tenants).where(eq(tenants.slug, identifier)).get()
  }

  if (!tenant || !tenant.isActive) return null

  const tenantContext: TenantContext = {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    logo: tenant.logo,
    primaryColor: tenant.primaryColor || '#3B82F6',
    aiModel: tenant.aiModel || 'gpt-4o-mini',
    aiEnabled: tenant.aiEnabled ?? true,
    maxCases: tenant.maxCases || 100,
    maxStorageMb: tenant.maxStorageMb || 1024,
    maxApiCalls: tenant.maxApiCalls || 10000,
  }

  // 更新缓存
  tenantCache.set(identifier, { tenant: tenantContext, cachedAt: Date.now() })

  return tenantContext
}

/**
 * 租户中间件
 * 解析租户上下文并添加到 event.context.tenant
 */
export default defineEventHandler(async (event: H3Event) => {
  // 跳过不需要租户的路由
  const path = getRequestURL(event).pathname
  const skipPaths = [
    '/',
    '/about',
    '/mediation',
    '/neutral-evaluation',
    '/dispute-review',
    '/consulting',
    '/training',
    '/contact',
    '/api/auth/',
    '/api/admin/tenants',
    '/_ws',
    '/health',
  ]
  if (skipPaths.some((p) => path === p || path.startsWith(p + '/'))) {
    return
  }

  const identifier = extractTenantIdentifier(event)
  if (!identifier) {
    // 没有指定租户时使用默认租户（单租户模式兼容）
    event.context.tenant = null
    return
  }

  const tenant = await getTenantByIdentifier(identifier)
  if (!tenant) {
    throw createError({
      statusCode: 404,
      message: '租户不存在或已禁用',
    })
  }

  event.context.tenant = tenant
})

/**
 * 要求租户上下文
 */
export function requireTenant(event: H3Event): TenantContext {
  const tenant = event.context.tenant as TenantContext | null
  if (!tenant) {
    throw createError({
      statusCode: 400,
      message: '请指定租户',
    })
  }
  return tenant
}

/**
 * 获取租户上下文（可选）
 */
export function getTenant(event: H3Event): TenantContext | null {
  return (event.context.tenant as TenantContext) || null
}

/**
 * 清除租户缓存（在租户信息更新后调用）
 */
export function clearTenantCache(tenantId?: string) {
  if (tenantId) {
    // 清除特定租户的缓存
    for (const [key, value] of tenantCache.entries()) {
      if (value.tenant.id === tenantId) {
        tenantCache.delete(key)
      }
    }
  } else {
    // 清除所有缓存
    tenantCache.clear()
  }
}
