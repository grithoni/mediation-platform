import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDb } from '../database'
import { mediators, cases, users } from '../database/schema'

const JWT_SECRET = process.env.JWT_SECRET || 'mediation-platform-secret-key'

// ============================================================
// 认证工具
// ============================================================

export interface AuthUser {
  id: string
  name: string
  username: string
  role: string
}

/**
 * 验证调解员登录（用户名 + 密码）- 兼容旧系统
 */
export async function authenticateMediator(username: string, password: string): Promise<AuthUser | null> {
  const db = getDb()
  const mediator = db
    .select()
    .from(mediators)
    .where(eq(mediators.username, username))
    .get()

  if (!mediator) return null

  const valid = await bcrypt.compare(password, mediator.passwordHash)
  if (!valid) return null

  return {
    id: mediator.id,
    name: mediator.name,
    username: mediator.username,
    role: mediator.role,
  }
}

/**
 * 验证用户登录（新用户系统）
 */
export async function authenticateUser(username: string, password: string): Promise<AuthUser | null> {
  const db = getDb()
  const user = db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .get()

  if (!user || !user.passwordHash) return null

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  if (!user.isActive) return null

  // 更新最后登录时间
  db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, user.id)).run()

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
  }
}

/**
 * 生成 JWT token
 */
export function generateToken(user: { id: string; username: string; role: string; name: string }): string {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

/**
 * 验证 JWT token
 */
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

/**
 * 验证当事人访问权限
 */
export function verifyPartyAccess(caseNumber: string, accessCode: string) {
  const db = getDb()
  const caseData = db
    .select()
    .from(cases)
    .where(eq(cases.id, caseNumber))
    .get()

  if (!caseData) return { valid: false, caseData: null as any }
  if (caseData.accessCode !== accessCode) return { valid: false, caseData: null as any }

  return { valid: true, caseData }
}

/**
 * 通过 ID 获取用户
 */
export async function getUserById(userId: string) {
  const db = getDb()
  return db.select().from(users).where(eq(users.id, userId)).get()
}

/**
 * 通过用户名获取用户
 */
export async function getUserByUsername(username: string) {
  const db = getDb()
  return db.select().from(users).where(eq(users.username, username)).get()
}
