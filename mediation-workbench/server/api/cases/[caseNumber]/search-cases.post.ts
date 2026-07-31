// ============================================================
// POST /api/cases/:caseNumber/search-cases
// 类案推荐：根据案件事实在知识库参考案例中检索类案裁决书
// 返回 1-2 份裁决书摘要，附带文件路径供下载
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

  // ── 构建检索查询（侧重案件类型和争议性质） ─────────────
  const queryParts: string[] = []
  if (caseData.title) queryParts.push(caseData.title)
  if (df?.disputeChecklist) queryParts.push(String(df.disputeChecklist).slice(0, 200))
  if (df?.positions) queryParts.push(String(df.positions).slice(0, 200))
  if (caseData.claimsSummary) queryParts.push(String(caseData.claimsSummary).slice(0, 200))
  if (caseData.description) queryParts.push(String(caseData.description).slice(0, 200))
  const searchQuery = queryParts.join(' ').slice(0, 500)

  console.log(`[search-cases] case=${caseNumber} query_len=${searchQuery.length}`)

  // ── 搜索知识库，过滤参考案例目录 ─────────────────────
  let caseResults: Array<{ path: string; content: string; score: number }> = []
  try {
    const kbResults = await searchKb(searchQuery, 20, 'hybrid')
    caseResults = kbResults.filter(r => {
      const p = r.path.toLowerCase()
      return p.includes('参考案例') || p.includes('cases') || p.includes('裁决')
    }).slice(0, 4) // 取前4个候选，后面用AI选最佳2个
    console.log(`[search-cases] case=${caseNumber} total=${kbResults.length} filtered=${caseResults.length}`)
  } catch (err: any) {
    console.warn('[search-cases] KB search failed:', err.message)
    throw createError({ statusCode: 503, message: '知识库不可用，请检查 KB 服务是否启动' })
  }

  if (caseResults.length === 0) {
    return { success: true, data: { query: searchQuery.slice(0, 100), cases: [], message: '未找到相似案例' } }
  }

  // ── 用 AI 生成案例摘要 ───────────────────────────────
  const config = useRuntimeConfig()
  let summaries: Array<{ path: string; fileName: string; dirName: string; summary: string }> = []

  if (config.openaiApiKey && caseResults.length > 0) {
    try {
      const { generateText } = await import('ai')
      const { createOpenAI } = await import('@ai-sdk/openai')
      const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey: config.openaiApiKey }
      if (config.openaiBaseUrl) openaiOptions.baseURL = config.openaiBaseUrl
      const openai = createOpenAI(openaiOptions)

      // 构建候选案例文本
      const candidatesText = caseResults.map((r, i) => {
        const parts = r.path.split('/')
        const fileName = (parts[parts.length - 1] || r.path).replace(/\.md$/i, '')
        return `【案例${i + 1}：${fileName}】\n${r.content.slice(0, 2000)}`
      }).join('\n\n---\n\n')

      const summaryPrompt = `## 角色
你是一位资深商事调解专家。

## 当前案件
- 案件：${caseData.title}
- 当事人：${caseData.partyAName} vs ${caseData.partyBName}

## 任务
从以下候选案例中，选出与当前案件最相似的 1-2 个案例。
对每个选出的案例，生成一份结构化摘要（200-400字），包括：
1. 案件类型和当事人
2. 争议焦点
3. 裁判要旨（判决/裁决的核心观点）
4. 对当前案件的参考价值

## 候选案例
${candidatesText}

## 输出格式（严格 JSON 数组，不要包裹代码块）
[
  {
    "index": 1,
    "summary": "摘要内容..."
  }
]

如果所有案例都不太相关，返回空数组 []。只输出 JSON。`

      const result = await generateText({
        model: openai(config.openaiModel || 'gpt-4o-mini'),
        prompt: summaryPrompt,
        temperature: 0.3,
      })

      // 解析 JSON
      const jsonMatch = result.text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; summary: string }>
        for (const item of parsed) {
          const idx = item.index - 1
          if (idx >= 0 && idx < caseResults.length) {
            const r = caseResults[idx]
            const parts = r.path.split('/')
            const fileName = (parts[parts.length - 1] || r.path).replace(/\.md$/i, '')
            const dirName = parts.length > 1 ? parts[parts.length - 2] : ''
            summaries.push({ path: r.path, fileName, dirName, summary: item.summary })
          }
        }
      }
      console.log(`[search-cases] case=${caseNumber} summaries=${summaries.length}`)
    } catch (err: any) {
      console.warn('[search-cases] AI summary failed:', err.message)
    }
  }

  // 如果 AI 摘要失败，直接返回原始内容的前200字作为摘要
  if (summaries.length === 0) {
    summaries = caseResults.slice(0, 2).map(r => {
      const parts = r.path.split('/')
      const fileName = (parts[parts.length - 1] || r.path).replace(/\.md$/i, '')
      const dirName = parts.length > 1 ? parts[parts.length - 2] : ''
      return { path: r.path, fileName, dirName, summary: r.content.slice(0, 300) + '...' }
    })
  }

  return {
    success: true,
    data: {
      query: searchQuery.slice(0, 100),
      cases: summaries,
    },
  }
})
