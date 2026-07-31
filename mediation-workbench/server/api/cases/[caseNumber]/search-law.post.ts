// ============================================================
// POST /api/cases/:caseNumber/search-law
// 法条检索：根据案件事实和请求，在知识库中检索相关法律法规
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { cases, caseDynamicFiles } from '../../../database/schema'
import { requireAuth } from '../../../middleware/auth'
import { searchKb } from '../../../utils/kb-search'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const db = getDb()

  const caseData = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseNumber)).get()

  // ── 构建检索查询 ──────────────────────────────────────
  // 优先用动态文件中的立场分析和争议清单，其次用案件描述和请求
  const queryParts: string[] = []
  if (df?.positions) queryParts.push(String(df.positions).slice(0, 300))
  if (df?.disputeChecklist) queryParts.push(String(df.disputeChecklist).slice(0, 200))
  if (caseData.claimsSummary) queryParts.push(String(caseData.claimsSummary).slice(0, 200))
  if (caseData.description) queryParts.push(String(caseData.description).slice(0, 200))
  if (queryParts.length === 0) {
    queryParts.push(caseData.title || '')
  }
  const searchQuery = queryParts.join(' ').slice(0, 500)

  console.log(`[search-law] case=${caseNumber} query_len=${searchQuery.length}`)

  // ── 搜索知识库 ────────────────────────────────────────
  let results: Array<{ path: string; content: string; score: number }> = []
  try {
    const kbResults = await searchKb(searchQuery, 15, 'hybrid')
    // 不再目录过滤，直接返回前8条
    results = kbResults.slice(0, 8)
    console.log(`[search-law] case=${caseNumber} total=${kbResults.length} filtered=${results.length}`)
  } catch (err: any) {
    console.warn('[search-law] KB search failed:', err.message)
    throw createError({ statusCode: 503, message: '知识库不可用，请检查 KB 服务是否启动' })
  }

  if (results.length === 0) {
    return { success: true, data: { query: searchQuery.slice(0, 100), results: [], message: '未找到相关法条' } }
  }

  return {
    success: true,
    data: {
      query: searchQuery.slice(0, 100),
      results: results.map(r => {
        // 提取文件名和目录作为来源
        const parts = r.path.split('/')
        const fileName = parts[parts.length - 1] || r.path
        const dirName = parts.length > 1 ? parts[parts.length - 2] : ''
        return {
          path: r.path,
          fileName: fileName.replace(/\.md$/i, ''),
          dirName,
          content: r.content,
          score: Math.round(r.score * 100) / 100,
        }
      }),
    },
  }
})
