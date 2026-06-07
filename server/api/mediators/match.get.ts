// ============================================================
// GET /api/mediators/match — 匹配合适的调解员（3-5名）
// ============================================================
import { getDb } from '../../database'
import { mediators, cases, caseDynamicFiles } from '../../database/schema'
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

  // Fetch dynamic file for richer keyword extraction
  const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseId)).get()

  // Extract keywords from title + description + dispute checklist
  const searchText = [
    caseRow.title || '',
    caseRow.description || '',
    df?.disputeChecklist || '',
    df?.positions || '',
  ].join(' ')
  const keywords = extractKeywords(searchText)

  const allMediators = db.select().from(mediators).all()
    .filter(m => m.role !== 'admin')

  // Count active cases per mediator for load balancing
  const allCases = db.select().from(cases).all()
  const activeCaseCount = new Map<string, number>()
  for (const c of allCases) {
    if (c.mediatorId && (c.status === 'active' || c.phase === 'active')) {
      activeCaseCount.set(c.mediatorId, (activeCaseCount.get(c.mediatorId) || 0) + 1)
    }
  }

  const scored = allMediators.map(m => {
    let score = 0

    // Specialty match (primary factor)
    if (m.specialties) {
      try {
        const specs: string[] = JSON.parse(m.specialties)
        for (const kw of keywords) {
          if (specs.some(s => s.includes(kw) || kw.includes(s))) score += 10
        }
      } catch {}
    }

    // Full-time mediators get a slight boost
    if (m.appointmentType === '专职') score += 3

    // Education bonus (diminishing returns)
    if (m.education === '博士') score += 2
    else if (m.education === '硕士') score += 1

    // Load penalty: reduce score for heavily loaded mediators
    const load = activeCaseCount.get(m.id) || 0
    if (load >= 5) score -= 10
    else if (load >= 3) score -= 5
    else if (load >= 1) score -= 2

    // Foreign language capability bonus if case involves foreign elements
    if (m.hasForeignCapability && (searchText.includes('涉外') || searchText.includes('外商') || searchText.includes('海外'))) {
      score += 5
    }

    return { m, score, load }
  })

  const matched = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => ({
      id: s.m.id,
      name: s.m.name,
      score: s.score,
      activeCases: s.load,
      specialties: safeParseJson(s.m.specialties),
      appointmentType: s.m.appointmentType,
      education: s.m.education,
      university: s.m.university,
      organization: s.m.organization,
      position: s.m.position,
    }))

  return { success: true, data: matched }
})

function extractKeywords(text: string): string[] {
  const map: Record<string, string[]> = {
    '加盟': ['贸易', '投资'], '连锁': ['贸易', '投资'],
    '情感': ['贸易'], '教育': ['知识产权', '贸易'], '培训': ['知识产权', '贸易'],
    '法律': ['贸易'], '代理': ['贸易'], '营销': ['贸易', '金融'],
    '策划': ['贸易'], '加工': ['工程建设', '贸易'], '设备': ['贸易', '工程建设'],
    '采购': ['贸易'], '合同': ['贸易', '投资', '金融'], '纠纷': ['贸易', '投资'],
    '房产': ['房地产', '工程建设'], '租赁': ['房地产', '贸易'],
    '借款': ['金融'], '贷款': ['金融'], '股权': ['投资', '金融'],
    '知产': ['知识产权'], '专利': ['知识产权'], '商标': ['知识产权'],
    '运输': ['运输', '贸易'], '物流': ['运输', '贸易'],
  }
  const found: string[] = []
  for (const [k, v] of Object.entries(map)) {
    if (text.includes(k)) found.push(...v)
  }
  return [...new Set(found)]
}

function safeParseJson(str: string | null): any[] {
  if (!str) return []
  try { return JSON.parse(str) } catch { return [] }
}
