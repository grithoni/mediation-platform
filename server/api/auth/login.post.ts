import { authenticateMediator } from '../../utils/auth'
import { sessionConfig } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.username || !body?.password) {
    throw createError({ statusCode: 400, message: '用户名和密码不能为空' })
  }

  const user = await authenticateMediator(body.username, body.password)
  if (!user) {
    throw createError({ statusCode: 401, message: '用户名或密码错误' })
  }

  // Persist mediator info in session
  const session = await useSession(event, sessionConfig)
  await session.update({ mediator: user })

  return {
    success: true,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    },
  }
})
