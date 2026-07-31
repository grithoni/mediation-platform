// ============================================================
// server/utils/analysis-core.ts
// AI 分析核心函数 — 被 API 层和自动触发共用
// ============================================================
import { eq } from 'drizzle-orm'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { getDb } from '../database'
import { cases, caseDynamicFiles, documents, caseAnalyses } from '../database/schema'
import { searchKb } from './kb-search'
import { getCachedAnalysis } from './analysis-cache'
import { and } from 'drizzle-orm'

export type AnalysisType = 'claim_basis' | 'anticipate_defense' | 'evidence_checklist' | 'recommend_solution'

/** 统一入口 — API 层调用此函数，内置缓存检查 */
export async function runAnalysis(caseNumber: string, type: AnalysisType): Promise<string> {
  const cached = getCachedAnalysis(caseNumber, type)
  if (cached) return cached

  const content = await runAnalysisCore(caseNumber, type)
  // 自动保存到缓存
  if (content && content.length > 100) {
    const { saveAnalysis } = await import('./analysis-cache')
    saveAnalysis(caseNumber, type, content)
  }
  return content
}

/** 核心分析（不读缓存，供绑定后自动使用） */
async function runAnalysisCore(caseNumber: string, type: AnalysisType): Promise<string> {
  const db = getDb()
  const caseData = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
  if (!caseData) throw new Error('案件不存在')
  const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseNumber)).get()

  // 读取前2个文件内容
  const docs = db.select().from(documents).where(eq(documents.caseId, caseNumber)).all()
  let fileContent = ''
  for (const doc of docs.slice(0, 2)) {
    try {
      const lower = doc.originalName.toLowerCase()
      let text = ''
      if (lower.endsWith('.pdf')) text = execSync(`pdftotext -layout "${doc.path}" -`, { encoding: 'utf-8', timeout: 10000, maxBuffer: 5 * 1024 * 1024 })
      else if (lower.endsWith('.docx') || lower.endsWith('.doc')) text = execSync(`textutil -convert txt -stdout "${doc.path}"`, { encoding: 'utf-8', timeout: 10000, maxBuffer: 5 * 1024 * 1024 })
      else text = readFileSync(doc.path, 'utf-8')
      fileContent += `\n【${doc.originalName}】\n${text.slice(0, 3000)}\n`
    } catch {}
  }

  // 读取前3个分析的结果（供重构方案使用）
  const getOtherAnalysis = (t: AnalysisType) => {
    const row = db.select().from(caseAnalyses).where(and(eq(caseAnalyses.caseId, caseNumber), eq(caseAnalyses.analysisType, t))).get()
    return row?.content || ''
  }

  const config = useRuntimeConfig()
  if (!config.openaiApiKey) return '未配置AI服务'

  const safe = (v: any) => (v && String(v).trim()) || '（暂无）'
  const { generateText } = await import('ai')
  const { createOpenAI } = await import('@ai-sdk/openai')
  const o = createOpenAI({ apiKey: config.openaiApiKey as string, baseURL: config.openaiBaseUrl as string })

  // 根据类型构建 prompt
  let system = '你是法律专家。'
  let prompt = ''
  let maxTokens = 3000

  if (type === 'claim_basis') {
    system = '你是商事律师，专长请求权基础分析。只输出报告。'
    prompt = buildClaimBasisPrompt(caseData, df, fileContent)
  } else if (type === 'anticipate_defense') {
    system = '你是商事律师，专长抗辩预测。只输出报告。'
    prompt = buildAnticipateDefensePrompt(caseData, df, fileContent)
  } else if (type === 'evidence_checklist') {
    system = '你是商事律师，专长证据分析。只输出证据清单。'
    prompt = buildEvidencePrompt(caseData, df, docs.map(d => d.originalName))
    maxTokens = 3500
  } else if (type === 'recommend_solution') {
    system = '你是调解专家，专长利益重构方案。只输出报告。'
    const cb = getOtherAnalysis('claim_basis')
    const ad = getOtherAnalysis('anticipate_defense')
    const ec = getOtherAnalysis('evidence_checklist')
    prompt = buildRecommendSolutionPrompt(caseData, df, cb, ad, ec)
    maxTokens = 4000
  }

  // KB search
  try {
    const kbResults = await searchKb(prompt.slice(0, 200), 3)
    if (kbResults.length > 0) prompt += '\n\n## 法律法规参考\n' + kbResults.slice(0, 2).map(r => r.content.slice(0, 500)).join('\n---\n')
  } catch {}

  const result = await generateText({
    model: o(config.openaiModel as string || 'deepseek-v4-pro'),
    system,
    messages: [{ role: 'user' as const, content: prompt }],
    temperature: 0.3,
    maxTokens,
  }).catch((err: any) => { throw new Error(`AI调用失败: ${err.message}`) })

  return result.text.trim()
}

// ── Prompt builders ───────────────────────────────────────────

function buildClaimBasisPrompt(c: any, df: any, fc: string) {
  const s = (v: any) => (v && String(v).trim()) || '（暂无）'
  return `案件：${s(c.title)}\n申请人：${s(c.partyAName)}\n被申请人：${s(c.partyBName)}\n描述：${s(c.description)}\n主张：${s(c.claimsSummary)}\n争议：${s(df?.disputeChecklist)}\n立场：${s(df?.positions)}\n${fc ? '\n材料：' + fc : ''}\n\n请分析请求权基础（构成要件、最优组合、举证责任、风险），800-1500字。`
}
function buildAnticipateDefensePrompt(c: any, df: any, fc: string) {
  const s = (v: any) => (v && String(v).trim()) || '（暂无）'
  return `案件：${s(c.title)}\n申请人：${s(c.partyAName)}\n被申请人：${s(c.partyBName)}\n描述：${s(c.description)}\n时间线：${s(df?.timeline)}\n争议：${s(df?.disputeChecklist)}\n立场：${s(df?.positions)}\n利益：${s(df?.potentialInterests)}\nBATNA：${s(df?.batna)}\n${fc ? '\n材料：' + fc : ''}\n\n请预测被申请人抗辩（程序+实体+免责+反诉+和解空间），800-1500字。`
}
function buildEvidencePrompt(c: any, df: any, files: string[]) {
  const s = (v: any) => (v && String(v).trim()) || '（暂无）'
  return `案件：${s(c.title)}\n当事人：${s(c.partyAName)} vs ${s(c.partyBName)}\n描述：${s(c.description)}\n时间线：${s(df?.timeline)}\n争议：${s(df?.disputeChecklist)}\n立场：${s(df?.positions)}\n已上传文件：${files.join(', ') || '（暂无）'}\n\n请生成证据清单（待证事实+证据核对+三性分析+补强建议），1000-1500字。`
}
function buildRecommendSolutionPrompt(c: any, df: any, claimBasis: string, defense: string, evidence: string) {
  const s = (v: any) => (v && String(v).trim()) || '（暂无）'
  return `你是调解专家。请综合以下分析结果生成利益重构方案。

## 案件
标题：${s(c.title)}\n申请人：${s(c.partyAName)}\n被申请人：${s(c.partyBName)}\n立场：${s(df?.positions)}\n利益：${s(df?.potentialInterests)}\nBATNA：${s(df?.batna)}

## 请求权基础分析
${claimBasis || '（尚未分析）'}

## 抗辩预测
${defense || '（尚未分析）'}

## 证据清单
${evidence || '（尚未分析）'}

## 输出
生成利益重构方案报告：关键信息摘要 + 利益矩阵 + 方案推荐（2-3个）+ 执行建议 + 风险提示。1000-1500字。基于以上分析，将请求权/抗辩/证据结果融入方案中。`
}
