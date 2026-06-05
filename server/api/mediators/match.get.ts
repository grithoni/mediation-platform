// ============================================================
// GET /api/mediators/match — 匹配合适的调解员（3-5名）
// ============================================================
import { getDb } from '../../database'
import { mediators, cases } from '../../database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = getDb()
  const query = getQuery(event)
  const caseId = query.caseId as string

  if (!caseId) {
    return { success: false, error: '缺少 caseId 参数' }
  }

  const caseRow = db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseRow) {
    return { success: false, error: '案件不存在' }
  }

  const allMediators = db.select().from(mediators).all()
    .filter(m => m.role !== 'admin')

  const keywords = extractKeywords(caseRow.title)
  const scored = allMediators.map(m => {
    let score = 0
    if (m.specialties) {
      try {
        const specs: string[] = JSON.parse(m.specialties)
        for (const kw of keywords) {
          if (specs.some(s => s.includes(kw) || kw.includes(s))) score += 10
        }
      } catch {}
    }
    if (m.appointmentType === '专职') score += 5
    if (m.degree === '博士') score += 3
    return { m, score }
  })

  const matched = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => ({
      id: s.m.id,
      name: s.m.name,
      score: s.score,
      specialties: safeParseJson(s.m.specialties),
      appointmentType: s.m.appointmentType,
      education: s.m.education,
      university: s.m.university,
      organization: s.m.organization,
      position: s.m.position,
    }))

  return { success: true, data: matched }
})

function extractKeywords(title: string): string[] {
  const map: Record<string, string[]> = {
    '加盟': ['贸易', '投资'], '连锁': ['贸易', '投资'],
    '情感': ['贸易'], '教育': ['知识产权', '贸易'], '培训': ['知识产权', '贸易'],
    '法律': ['贸易'], '代理': ['贸易'], '营销': ['贸易', '金融'],
    '策划': ['贸易'], '加工': ['工程建设', '贸易'], '设备': ['贸易', '工程建设'],
    '采购': ['贸易'], '合同': ['贸易', '投资', '金融'], '纠纷': ['贸易', '投资'],
  }
  const found: string[] = []
  for (const [k, v] of Object.entries(map)) {
    if (title.includes(k)) found.push(...v)
  }
  return [...new Set(found)]
}

function safeParseJson(str: string | null): any[] {
  if (!str) return []
  try { return JSON.parse(str) } catch { return [] }
}
