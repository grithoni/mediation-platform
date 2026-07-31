import type { H3Event } from 'h3'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'mediation-platform-secret-key'

// ============================================================
// 用户角色类型
// ============================================================

export type UserRole = 'claimant' | 'respondent' | 'mediator' | 'case_manager' | 'admin'

export interface AuthUser {
  userId: string
  username: string
  role: UserRole
  name: string
  tenantId?: string
}

// ============================================================
// Session configuration (保留兼容)
// ============================================================

export const sessionConfig = {
  password: process.env.SESSION_SECRET || 'mediation-platform-default-session-secret-change-in-prod!',
  maxAge: 60 * 60 * 24 * 7, // 7 days
  name: 'mediation-session',
}

// ============================================================
// JWT Token 验证
// ============================================================

function extractTokenFromHeader(event: H3Event): string | null {
  const authHeader = getRequestHeader(event, 'authorization')
  if (!authHeader) return null

  // 支持 "Bearer xxx" 格式
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // 支持直接传 token
  return authHeader
}

function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser
    return decoded
  } catch {
    return null
  }
}

// ============================================================
// Middleware: 解析用户身份（JWT 优先，Session 兼容）
// ============================================================

export default defineEventHandler(async (event: H3Event) => {
  // 1. 尝试从 JWT token 解析
  const token = extractTokenFromHeader(event)
  if (token) {
    const user = verifyToken(token)
    if (user) {
      event.context.user = user
      event.context.authMethod = 'jwt'
      return
    }
  }

  // 2. 兼容旧的 Session 方式
  const session = await useSession(event, sessionConfig)
  event.context.session = session

  // 3. 未认证
  event.context.user = null
  event.context.authMethod = null
})

// ============================================================
// Auth guard helpers — 调用于需要认证的 API 路由
// ============================================================

/**
 * 要求用户已认证（任意角色）
 */
export function requireAuth(event: H3Event): AuthUser {
  const user = event.context.user as AuthUser | null
  if (!user) {
    throw createError({ statusCode: 401, message: '请先登录' })
  }
  return user
}

/**
 * 要求用户具有指定角色之一
 */
export function requireRole(event: H3Event, roles: UserRole[]): AuthUser {
  const user = requireAuth(event)
  if (!roles.includes(user.role)) {
    throw createError({ statusCode: 403, message: '权限不足' })
  }
  return user
}

/**
 * 要求调解员或更高权限
 */
export function requireMediator(event: H3Event): AuthUser {
  return requireRole(event, ['mediator', 'case_manager', 'admin'])
}

/**
 * 要求案件管理员或更高权限
 */
export function requireCaseManager(event: H3Event): AuthUser {
  return requireRole(event, ['case_manager', 'admin'])
}

/**
 * 要求系统管理员
 */
export function requireAdmin(event: H3Event): AuthUser {
  return requireRole(event, ['admin'])
}
