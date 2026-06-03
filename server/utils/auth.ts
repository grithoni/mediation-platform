import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { getDb } from '../database'
import { mediators, cases } from '../database/schema'

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
 * 验证调解员登录（用户名 + 密码）
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
