import { requireAuth } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)

  return {
    success: true,
    user: {
      id: mediator.id,
      name: mediator.name,
      username: mediator.username,
      role: mediator.role,
    },
  }
})
