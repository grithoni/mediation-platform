import type { H3Event } from 'h3'
import type { AuthUser } from '../utils/auth'

// ============================================================
// Session configuration
// ============================================================

export const sessionConfig = {
  password: process.env.SESSION_SECRET || 'mediation-platform-default-session-secret-change-in-prod!',
  maxAge: 60 * 60 * 24 * 7, // 7 days
  name: 'mediation-session',
}

// ============================================================
// Middleware: parse session on every request
// ============================================================

export default defineEventHandler(async (event: H3Event) => {
  const session = await useSession(event, sessionConfig)
  event.context.session = session
  event.context.mediator = (session.data as any).mediator || null
})

// ============================================================
// Auth guard helper — call from API routes that require auth
// ============================================================

export function requireAuth(event: H3Event): AuthUser {
  const mediator = event.context.mediator as AuthUser | null
  if (!mediator) {
    throw createError({ statusCode: 401, message: '请先登录' })
  }
  return mediator
}
