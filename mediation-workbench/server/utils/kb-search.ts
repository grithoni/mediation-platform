/**
 * KB Search Utility — HTTP wrapper for the local knowledge base
 *
 * Calls the Python FastAPI KB server (default port 8700) to perform
 * semantic search over indexed legal documents.
 */

import { getKbUrl } from './service-urls'

export interface KbSearchResult {
  path: string
  content: string
  score: number
}

export interface KbSearchResponse {
  results: KbSearchResult[]
}

// Simple in-memory cache: query → { results, timestamp }
const kbCache = new Map<string, { results: KbSearchResult[]; timestamp: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
let kbUnavailableUntil = 0 // Backoff timestamp when KB is down

/**
 * Search the knowledge base for relevant legal provisions.
 * Returns an empty array if KB is unavailable (graceful degradation).
 *
 * @param query - Search query
 * @param topK - Number of results to return
 * @param mode - Search mode: "hybrid" (vector+BM25, default), "vector" (semantic only), "keyword" (BM25 only), "rerank" (hybrid + cross-encoder refinement)
 */
export async function searchKb(query: string, topK = 3, mode: 'hybrid' | 'vector' | 'keyword' | 'rerank' = 'hybrid'): Promise<KbSearchResult[]> {
  const cacheKey = `${query}::${topK}::${mode}`

  // Check cache
  const cached = kbCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results
  }

  // Backoff: if KB was recently unavailable, skip for a while
  if (Date.now() < kbUnavailableUntil) {
    return []
  }

  const kbUrl = getKbUrl()

  try {
    const resp = await $fetch<KbSearchResponse>(`${kbUrl}/search`, {
      method: 'POST',
      body: { query, top_k: topK, mode },
      timeout: 5000,
    })
    const results = resp.results || []

    // Cache the result
    kbCache.set(cacheKey, { results, timestamp: Date.now() })

    // Reset backoff on success
    kbUnavailableUntil = 0

    return results
  } catch (err: any) {
    // KB unavailable — set backoff and log warning
    kbUnavailableUntil = Date.now() + 30_000 // retry after 30s
    console.warn(`[KB] Knowledge base unavailable (${err.message}), falling back. Will retry in 30s.`)
    return []
  }
}

/**
 * Format KB search results into a prompt-injectable string for the LLM.
 * Each result includes source file name and content snippet.
 */
export function formatKbResultsForPrompt(results: KbSearchResult[]): string {
  if (!results.length) return ''

  const sections = results.map((r, i) => {
    // Extract just the filename from the full path
    const fileName = r.path.split('/').pop() || r.path
    return `【参考${i + 1}：${fileName}】\n${r.content}`
  })

  return `

## 参考法律条文（知识库检索）
以下是与当前问题可能相关的法律条文和调解规范，请在回答时参考：

${sections.join('\n\n---\n\n')}

注意：仅参考以上条文回答，不要编造未列出的法条。如果以上条文与问题无关，可忽略。`
}
