import { requireAuth } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  return {
    success: true,
    data: {
      user: {
        id: user.userId,
        name: user.name,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
      },
    },
  }
})
