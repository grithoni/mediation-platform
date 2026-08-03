import { getDb } from '~/server/database'
import { users } from '~/server/database/schema'
import { eq, or } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'mediation-platform-secret-key'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const { name, username, email, phone, password, role = 'claimant' } = body

  // 验证必填字段
  if (!name || !username || !password) {
    throw createError({
      statusCode: 400,
      message: '姓名、用户名和密码为必填项'
    })
  }

  // 验证角色
  const validRoles = ['claimant', 'respondent']
  if (!validRoles.includes(role)) {
    throw createError({
      statusCode: 400,
      message: '注册角色无效，只能注册申请人或被申请人'
    })
  }

  // 验证用户名长度
  if (username.length < 3 || username.length > 20) {
    throw createError({
      statusCode: 400,
      message: '用户名长度应为 3-20 个字符'
    })
  }

  // 验证密码强度
  if (password.length < 6) {
    throw createError({
      statusCode: 400,
      message: '密码长度至少 6 个字符'
    })
  }

  // 检查用户名是否已存在
  const db = getDb()
  const existingUser = await db.select().from(users).where(eq(users.username, username)).get()
  if (existingUser) {
    throw createError({
      statusCode: 409,
      message: '用户名已存在'
    })
  }

  // 检查邮箱是否已存在
  if (email) {
    const existingEmail = await db.select().from(users).where(eq(users.email, email)).get()
    if (existingEmail) {
      throw createError({
        statusCode: 409,
        message: '邮箱已被注册'
      })
    }
  }

  // 加密密码
  const salt = await bcrypt.genSalt(10)
  const passwordHash = await bcrypt.hash(password, salt)

  // 创建用户
  const userId = uuidv4()
  const now = Date.now()

  await db.insert(users).values({
    id: userId,
    role,
    name,
    username,
    email: email || null,
    phone: phone || null,
    passwordHash,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })

  // 生成 JWT token
  const token = jwt.sign(
    {
      userId,
      username,
      role,
      name,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )

  // 返回用户信息（不包含密码）
  return {
    success: true,
    data: {
      user: {
        id: userId,
        role,
        name,
        username,
        email,
        phone,
      },
      token,
    },
    message: '注册成功'
  }
})
