// ============================================================
// Shared dialog management — turn counting + dialog ending
// Used by both agent.post.ts and ai.post.ts
// ============================================================
import { eq, and, sql } from 'drizzle-orm'
import { getDb } from '../database'
import { cases, caseDynamicFiles } from '../database/schema'
import { CaseStatus } from './case-status'
import { recordCaseEvent } from './case-audit'

/**
 * Atomically increment dialog turn count and return the new value.
 * Creates the dynamic file record if it doesn't exist.
 * Returns 0 for demo cases.
 */
export function incrementDialogTurn(caseId: string): number {
  if (caseId === 'demo') return 0

  try {
    const db = getDb()
    const now = Date.now()
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
 *
 * The two DB operations (caseDynamicFiles + cases) are wrapped in a
 * transaction so they either both succeed or both fail, preventing
 * the inconsistent state where dialogEnded=true but phase is unchanged.
 */
export function endDialog(caseId: string): void {
  if (caseId === 'demo') return

  try {
    const db = getDb()
    const now = Date.now()
    // 对话结束后进入 VALUE V 阶段（接案准备）
    const targetPhase = CaseStatus.REVIEWING

    // Drizzle 的 better-sqlite3 驱动支持同步事务：
    // 传入的回调在事务中执行，回调 return 后自动 commit，
    // 抛出异常则自动 rollback。
    db.transaction((tx) => {
      const existing = tx
        .select()
        .from(caseDynamicFiles)
        .where(eq(caseDynamicFiles.caseId, caseId))
        .get()

      if (existing) {
        tx.update(caseDynamicFiles)
          .set({ dialogEnded: true, updatedAt: now })
          .where(eq(caseDynamicFiles.caseId, caseId))
          .run()
      } else {
        tx.insert(caseDynamicFiles)
          .values({
            id: caseId,
            caseId,
            dialogEnded: true,
            dialogTurnCount: 0,
            createdAt: now,
            updatedAt: now,
          })
          .run()
      }

      const prevCase = tx.select().from(cases).where(eq(cases.id, caseId)).get()
      tx.update(cases)
        .set({ phase: targetPhase, updatedAt: now })
        .where(eq(cases.id, caseId))
        .run()

      // 记录状态流转（系统自动触发：对话结束 -> 接案准备）
      recordCaseEvent({
        caseId,
        eventType: 'phase_changed',
        fromPhase: prevCase?.phase,
        toPhase: targetPhase,
        fromStatus: prevCase?.status,
        toStatus: prevCase?.status,
        source: 'system',
        reason: '当事人对话结束，自动进入接案准备',
      })
    })
  } catch (err) {
    console.error('[DialogManager] Failed to end dialog:', err)
  }
}

/** Max dialog turns before auto-ending */
export const MAX_DIALOG_TURNS = 5
