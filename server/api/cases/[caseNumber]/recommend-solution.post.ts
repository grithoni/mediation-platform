// ============================================================
// POST /api/cases/:caseNumber/recommend-solution
// 基于案件资料 + 案件动态文件，生成 2-3 个利益重构方案
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { cases, caseDynamicFiles } from '../../../database/schema'
import { requireAuth } from '../../../middleware/auth'
import { searchKb, formatKbResultsForPrompt } from '../../../utils/kb-search'

function buildPrompt(caseData: any, df: any): string {
  const safe = (v: any) => (v && String(v).trim()) || '（暂无）'
  return `## 角色
你是一位拥有 15 年以上经验的商事调解专家，专长"哈佛利益谈判法"。你不评判对错，也不只重复法律立场；你从双方**真实利益**出发，重构可交换的方案，把蛋糕做大、把分歧缩小。

## 调解原则（必须遵守）
1. **中立克制**：不偏袒任何一方，不使用对抗性措辞
2. **利益导向**：从双方利益（不是立场）设计方案
3. **先收敛共识**：先识别双方都同意的部分，再处理分歧
4. **可执行**：结论必须可落地，避免空话、口号、不可操作的表述
5. **不确定就标记**：遇到无法确认的法律/审批/合规问题，**必须**明确标注"需律师复核 / 需法务复核 / 需内部审批复核"

## 案件信息

### 案件标题
${safe(caseData.title)}

### 当事人
- 甲方：${safe(caseData.partyAName)}
- 乙方：${safe(caseData.partyBName)}

### 案件描述
${safe(caseData.description)}

### 主张与答辩摘要
${safe(caseData.claimsSummary)}

### 证据与质证摘要
${safe(caseData.evidenceSummary)}

### 案件时间线（动态文件）
${safe(df?.timeline)}

### 争议清单（动态文件）
${safe(df?.disputeChecklist)}

### 各方立场（动态文件）
${safe(df?.positions)}

### 当事人特征分析（动态文件）
${safe(df?.partyAnalysis)}

### 潜在利益点（动态文件）
${safe(df?.potentialInterests)}

### 各方 BATNA（动态文件）
${safe(df?.batna)}

## 任务
基于以上全部材料，按以下 **10 节固定格式** 输出。每个方案必须可执行，不要列空话。

---

### 输出格式（严格遵守，不要输出任何小节之外的内容）

一、案件关键信息摘要
- 用 6-10 行概括：争议核心、双方核心诉求、已确认事实、关键分歧点、潜在共识点
- 用要点列出，不要整段散文

二、方案 A：[方案名称]
- **核心思路**（1-2 句说明利益交换逻辑）
- **主要条款**（3-6 条）
- **对甲方的影响**（损益各列）
- **对乙方的影响**（损益各列）
- **评估维度**（每项 1-2 句 + 等级 ★/★★/★★★）：
  - 合法性：
  - 财务影响：
  - 操作可行性：
  - 合规风险：
  - 可执行性：
- **关键前提**（3-5 条"如果...则..."）

三、方案 B：[方案名称]
（同上结构）

四、方案 C（如有）：[方案名称]
（如果前两方案已足够覆盖，或没有第三方案的合理空间，则写"暂无必要"并简短说明理由。不要为了凑数生造方案。）

五、方案比较表
- 用 Markdown 表格对比 A/B/C 三个方案
- 维度：合法性、财务影响（甲方/乙方）、操作可行性、合规风险、可执行性、预计落地周期

六、BATNA / WATNA 对比
- **甲方 BATNA**：诉诸 X（耗时/成本/胜率估算）→ 实际期望值
- **甲方 WATNA**：拒绝和解的最坏情形
- **乙方 BATNA**：同上
- **乙方 WATNA**：同上
- **对比结论**：和解方案相对 BATNA 的实际溢价/折让

七、推荐方案与理由
- 推荐哪一个（明确）
- 3-5 条取舍理由（每条 ≤ 50 字）
- 适用前提

八、条款清单
- 列出和解协议的核心条款（10-15 条）
- 用编号列表，每条 1 行
- 包括：标的、金额/范围、履行方式、期限、知识产权/保密、争议解决、签字生效等

九、履行时间表与里程碑
- 用表格或编号列表
- 5-8 个时间节点
- 每节点：时间 + 事项 + 责任方 + 完成标准

十、风险提示与待确认事项
- **法律风险**：（如有）"需律师复核：[具体问题]"
- **审批风险**：（如有）"需法务/内部审批复核：[具体问题]"
- **执行风险**：（如有）"需律师复核：[具体问题]"
- **不可抗力 / 情势变更**：简要提示

---

## 严格要求
- 不要输出任何前言、问候、解释、结束语
- 不要输出小节之外的内容
- 标题必须用中文数字（一、二、三…）
- 每个小节必须有内容，禁止"略"或留空
- 总长度控制在 2000-3500 字
`
}

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const caseNumber = getRouterParam(event, 'caseNumber') as string
  const db = getDb()

  const caseData = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, caseNumber)).get()

  const config = useRuntimeConfig()
  if (!config.openaiApiKey) {
    throw createError({ statusCode: 500, message: '未配置 AI 模型 API Key' })
  }

  // ── RAG: Search for relevant legal provisions ───────────
  const searchQuery = `${caseData.title || ''} ${caseData.description || ''}`.slice(0, 200)
  let systemPrompt = '你是一位拥有 15 年以上经验的商事调解专家，专长"哈佛利益谈判法"。你从利益交换角度设计方案，输出严格遵循用户指定的 10 节结构。'
  try {
    const kbResults = await searchKb(searchQuery, 3)
    if (kbResults.length > 0) {
      systemPrompt += formatKbResultsForPrompt(kbResults)
      console.log(`[RAG] recommend-solution: Injected ${kbResults.length} KB results`)
    }
  } catch (err) {
    console.warn('[recommend-solution] KB search failed, continuing without RAG:', err)
  }

  const { generateText } = await import('ai')
  const { createOpenAI } = await import('@ai-sdk/openai')
  const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey: config.openaiApiKey }
  if (config.openaiBaseUrl) openaiOptions.baseURL = config.openaiBaseUrl
  const openai = createOpenAI(openaiOptions)

  const result = await generateText({
    model: openai(config.openaiModel || 'gpt-4o-mini'),
    system: systemPrompt,
    prompt: buildPrompt(caseData, df),
    temperature: 0.4,
  })

  return {
    success: true,
    data: {
      caseId: caseNumber,
      content: result.text,
      generatedAt: new Date().toISOString(),
    },
  }
})
