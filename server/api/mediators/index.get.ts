import { getDb } from '../../database'
import { mediators } from '../../database/schema'
import { requireAuth } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)

  // Only admins can list all mediators
  if (mediator.role !== 'admin') {
    throw createError({ statusCode: 403, message: '仅管理员可执行此操作' })
  }

  const db = getDb()
  const allMediators = db
    .select({
      id: mediators.id,
      name: mediators.name,
      username: mediators.username,
      role: mediators.role,
      avatar: mediators.avatar,
      createdAt: mediators.createdAt,
    })
    .from(mediators)
    .all()

  return { success: true, data: allMediators }
})
