// ============================================================
// Shared dialog management — turn counting + dialog ending
// Used by both agent.post.ts and ai.post.ts
// ============================================================
import { eq, and, sql } from 'drizzle-orm'
import { getDb } from '../database'
import { cases, caseDynamicFiles } from '../database/schema'

/**
 * Atomically increment dialog turn count and return the new value.
 * Creates the dynamic file record if it doesn't exist.
 * Returns 0 for demo cases.
 */
export function incrementDialogTurn(caseId: string): number {
  if (caseId === 'demo') return 0

  try {
    const db = getDb()
    const now = new Date()
    const existing = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseId)).get()

    if (existing) {
      db.update(caseDynamicFiles)
        .set({ dialogTurnCount: sql`coalesce(${caseDynamicFiles.dialogTurnCount}, 0) + 1`, updatedAt: now })
        .where(eq(caseDynamicFiles.caseId, caseId))
        .run()
      return (existing.dialogTurnCount || 0) + 1
    } else {
      db.insert(caseDynamicFiles).values({
        id: caseId, caseId, dialogTurnCount: 1, dialogEnded: false,
        createdAt: now, updatedAt: now,
      }).run()
      return 1
    }
  } catch (err) {
    console.error('[DialogManager] Failed to increment turn:', err)
    return 0
  }
}

/**
 * End the dialog for a case — set dialogEnded=true and advance phase.
 * Idempotent: safe to call multiple times.
 */
export function endDialog(caseId: string): void {
  if (caseId === 'demo') return

  try {
    const db = getDb()
    const now = new Date()
    const existing = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseId)).get()

    if (existing) {
      db.update(caseDynamicFiles)
        .set({ dialogEnded: true, updatedAt: now })
        .where(eq(caseDynamicFiles.caseId, caseId))
        .run()
    } else {
      db.insert(caseDynamicFiles).values({
        id: caseId, caseId, dialogEnded: true, dialogTurnCount: 0,
        createdAt: now, updatedAt: now,
      }).run()
    }

    db.update(cases)
      .set({ phase: 'mediator_selection', updatedAt: now })
      .where(eq(cases.id, caseId))
      .run()
  } catch (err) {
    console.error('[DialogManager] Failed to end dialog:', err)
  }
}

/** Max dialog turns before auto-ending */
export const MAX_DIALOG_TURNS = 5
