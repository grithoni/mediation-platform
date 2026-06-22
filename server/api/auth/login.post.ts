import { getDb } from '~/server/database'
import { users, mediators } from '~/server/database/schema'
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

  // 先从 users 表查找（新用户系统）
  const db = getDb()
  let user = await db.select().from(users).where(eq(users.username, username)).get()

  // 如果 users 表没找到，从 mediators 表查找（兼容旧数据）
  if (!user) {
    const mediator = await db.select().from(mediators).where(eq(mediators.username, username)).get()
    if (mediator) {
      // 验证密码
      const isValid = await bcrypt.compare(password, mediator.passwordHash)
      if (!isValid) {
        throw createError({ statusCode: 401, message: '用户名或密码错误' })
      }

      // 为旧调解员创建 users 记录（懒迁移）
      const userId = mediator.userId || mediator.id
      const existingUser = await db.select().from(users).where(eq(users.id, userId)).get()

      if (!existingUser) {
        await db.insert(users).values({
          id: userId,
          role: mediator.role === 'admin' ? 'admin' : 'mediator',
          name: mediator.name,
          username: mediator.username,
          email: mediator.email,
          phone: mediator.phone,
          passwordHash: mediator.passwordHash,
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }

      // 更新 lastLoginAt
      await db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, userId))

      // 生成 JWT token
      const token = jwt.sign(
        {
          userId,
          username: mediator.username,
          role: mediator.role === 'admin' ? 'admin' : 'mediator',
          name: mediator.name,
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      )

      return {
        success: true,
        data: {
          user: {
            id: userId,
            name: mediator.name,
            username: mediator.username,
            role: mediator.role === 'admin' ? 'admin' : 'mediator',
          },
          token,
        },
      }
    }

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
