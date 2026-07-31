// ============================================================
// server/utils/analysis-cache.ts
// AI 分析缓存 — 读/写 case_analyses 表，避免重复分析
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../database'
import { caseAnalyses } from '../database/schema'

export type AnalysisType = 'claim_basis' | 'anticipate_defense' | 'evidence_checklist' | 'recommend_solution'

/** 从缓存读取已有分析结果，无则返回 null */
export function getCachedAnalysis(caseNumber: string, type: AnalysisType): string | null {
  try {
    const db = getDb()
    const row = db.select()
      .from(caseAnalyses)
      .where(and(eq(caseAnalyses.caseId, caseNumber), eq(caseAnalyses.analysisType, type)))
      .get()
    return row?.content || null
  } catch {
    return null
  }
}

import { and } from 'drizzle-orm'

/** 保存分析结果到缓存 */
export function saveAnalysis(caseNumber: string, type: AnalysisType, content: string): void {
  try {
    const db = getDb()
    const id = crypto.randomUUID()
    // Upsert: delete old then insert
    db.delete(caseAnalyses)
      .where(and(eq(caseAnalyses.caseId, caseNumber), eq(caseAnalyses.analysisType, type)))
      .run()
    db.insert(caseAnalyses).values({
      id,
      caseId: caseNumber,
      analysisType: type,
      content,
      generatedAt: Date.now(),
    }).run()
  } catch (err: any) {
    console.warn(`[analysis-cache] save failed for ${caseNumber}/${type}:`, err.message)
  }
}

/** 获取某个案件的所有分析类型及是否完成 */
export function getAnalysisStatus(caseNumber: string): Record<string, { done: boolean; generatedAt?: number }> {
  try {
    const db = getDb()
    const rows = db.select()
      .from(caseAnalyses)
      .where(eq(caseAnalyses.caseId, caseNumber))
      .all()
    const status: Record<string, { done: boolean; generatedAt?: number }> = {
      claim_basis: { done: false },
      anticipate_defense: { done: false },
      evidence_checklist: { done: false },
      recommend_solution: { done: false },
    }
    for (const r of rows) {
      status[r.analysisType] = { done: true, generatedAt: r.generatedAt }
    }
    return status
  } catch {
    return {}
  }
}
