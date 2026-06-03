import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { mediators } from '../../database/schema'
import { requireAuth } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const admin = requireAuth(event)

  if (admin.role !== 'admin') {
    throw createError({ statusCode: 403, message: '仅管理员可执行此操作' })
  }

  const body = await readBody(event)

  if (!body?.name || !body?.username || !body?.password) {
    throw createError({ statusCode: 400, message: '姓名、用户名和密码不能为空' })
  }

  const db = getDb()

  // Check for duplicate username
  const existing = db
    .select()
    .from(mediators)
    .where(eq(mediators.username, body.username))
    .get()

  if (existing) {
    throw createError({ statusCode: 409, message: '该用户名已被注册' })
  }

  const passwordHash = await bcrypt.hash(body.password, 10)

  const newMediator = {
    id: uuidv4(),
    name: body.name,
    username: body.username,
    passwordHash,
    role: body.role || 'mediator',
    avatar: body.avatar || null,
    createdAt: new Date(),
  }

  db.insert(mediators).values(newMediator).run()

  return {
    success: true,
    data: {
      id: newMediator.id,
      name: newMediator.name,
      username: newMediator.username,
      role: newMediator.role,
      avatar: newMediator.avatar,
      createdAt: newMediator.createdAt,
    },
  }
})
