import { and, eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'
import { sessions } from '../database/schema'

type SessionRow = InferSelectModel<typeof sessions>

export interface AuthLikeUser {
  userId: string
  username: string
  role: string
  name: string
}

export interface MessageActorContext {
  user?: AuthLikeUser | null
  mediator?: AuthLikeUser | null
}

export type MessageActor =
  | { kind: 'mediator'; userId: string }
  | { kind: 'party'; userId?: string }
  | { kind: 'anonymous' }

export function classifyMessageActor(context: MessageActorContext): MessageActor {
  const principal = context.user || context.mediator
  if (!principal) return { kind: 'anonymous' }

  if (['admin', 'case_manager', 'mediator'].includes(principal.role)) {
    return { kind: 'mediator', userId: principal.userId }
  }

  return { kind: 'party', userId: principal.userId }
}

export function resolvePartySessionToken(
  db: {
    select: () => {
      from: (table: typeof sessions) => {
        where: (condition: unknown) => { get: () => SessionRow | undefined }
      }
    }
  },
  args: {
    caseId: string
    sessionToken?: string
  },
): SessionRow | undefined {
  const token = args.sessionToken?.trim()
  if (!token) return undefined

  const byId = db.select().from(sessions).where(
    and(
      eq(sessions.id, token),
      eq(sessions.caseId, args.caseId),
      eq(sessions.isActive, true),
    ),
  ).get()

  if (byId) return byId

  return db.select().from(sessions).where(
    and(
      eq(sessions.partyIdentifier, token),
      eq(sessions.caseId, args.caseId),
      eq(sessions.isActive, true),
    ),
  ).get()
}
