import { getDb } from '~/server/database'
import { users } from '~/server/database/schema'
import { eq, or } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'mediation-platform-secret-key'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.username || !body?.password) {
    throw createError({ statusCode: 400, message: '用户名和密码不能为空' })
  }

  const { username, password } = body

  // 从 users 表查找
  const db = getDb()
  const user = await db.select().from(users).where(eq(users.username, username)).get()

  if (!user) {
    throw createError({ statusCode: 401, message: '用户名或密码错误' })
  }

  // 验证密码
  if (!user.passwordHash) {
    throw createError({ statusCode: 401, message: '该账号未设置密码，请使用其他方式登录' })
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    throw createError({ statusCode: 401, message: '用户名或密码错误' })
  }

  // 检查账号状态
  if (!user.isActive) {
    throw createError({ statusCode: 403, message: '账号已被禁用，请联系管理员' })
  }

  // 更新 lastLoginAt
  await db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, user.id))

  // 生成 JWT token
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )

  return {
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        email: user.email,
        phone: user.phone,
      },
      token,
    },
  }
})
