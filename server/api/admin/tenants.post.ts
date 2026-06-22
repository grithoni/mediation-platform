import { getDb } from '~/server/database'
import { tenants } from '~/server/database/schema'
import { requireAdmin } from '~/server/middleware/auth'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

export default defineEventHandler(async (event) => {
  // 需要管理员权限
  requireAdmin(event)

  const body = await readBody(event)

  const {
    name,
    slug,
    logo,
    primaryColor,
    contactEmail,
    contactPhone,
    address,
    maxCases,
    maxStorageMb,
    maxApiCalls,
    aiModel,
    aiEnabled,
  } = body

  // 验证必填字段
  if (!name || !slug) {
    throw createError({
      statusCode: 400,
      message: '租户名称和标识符为必填项',
    })
  }

  // 验证 slug 格式
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw createError({
      statusCode: 400,
      message: '标识符只能包含小写字母、数字和连字符',
    })
  }

  // 检查 slug 是否已存在
  const db = getDb()
  const existing = await db.select().from(tenants).where(eq(tenants.slug, slug)).get()
  if (existing) {
    throw createError({
      statusCode: 409,
      message: '标识符已存在',
    })
  }

  // 创建租户
  const tenantId = uuidv4()
  const now = new Date()

  await db.insert(tenants).values({
    id: tenantId,
    name,
    slug,
    logo: logo || null,
    primaryColor: primaryColor || '#3B82F6',
    contactEmail: contactEmail || null,
    contactPhone: contactPhone || null,
    address: address || null,
    maxCases: maxCases || 100,
    maxStorageMb: maxStorageMb || 1024,
    maxApiCalls: maxApiCalls || 10000,
    aiModel: aiModel || 'gpt-4o-mini',
    aiEnabled: aiEnabled !== false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })

  return {
    success: true,
    data: {
      tenant: {
        id: tenantId,
        name,
        slug,
        logo,
        primaryColor,
        contactEmail,
        contactPhone,
        address,
        maxCases,
        maxStorageMb,
        maxApiCalls,
        aiModel,
        aiEnabled,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    },
    message: '租户创建成功',
  }
})
