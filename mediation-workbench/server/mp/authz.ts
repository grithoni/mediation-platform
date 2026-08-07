import { and, eq, or } from 'drizzle-orm'
import { getDb } from '../database'
import { cases, users } from '../database/schema'

export interface MpAuthUser {
  openid: string
}

export function resolveAuthorizedMpCases(user: MpAuthUser) {
  const db = getDb()

  if (user.openid.startsWith('demo_')) {
    const caseId = user.openid.slice('demo_'.length)
    return caseId ? [caseId] : []
  }

  const linkedUser = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.wxOpenId, user.openid))
    .get()

  if (!linkedUser) return []

  return db
    .select({ id: cases.id })
    .from(cases)
    .where(
      or(
        eq(cases.partyAUserId, linkedUser.id),
        eq(cases.partyBUserId, linkedUser.id),
      ),
    )
    .all()
    .map(row => row.id)
}

export function canAccessMpCase(user: MpAuthUser, caseId: string) {
  const db = getDb()

  if (user.openid.startsWith('demo_')) {
    return user.openid === `demo_${caseId}`
  }

  const linkedUser = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.wxOpenId, user.openid))
    .get()

  if (!linkedUser) return false

  const caseRow = db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        or(
          eq(cases.partyAUserId, linkedUser.id),
          eq(cases.partyBUserId, linkedUser.id),
        ),
      ),
    )
    .get()

  return !!caseRow
}
