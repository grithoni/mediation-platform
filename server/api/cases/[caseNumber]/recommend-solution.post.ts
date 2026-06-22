// ============================================================
// POST /api/cases/:caseNumber/recommend-solution
// 基于案件资料 + 案件动态文件，生成 2-3 个利益重构方案
// 优先读取已有动态文件，为空时才全量分析，结果写回动态文件
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { cases, caseDynamicFiles } from '../../../database/schema'
import { requireAuth } from '../../../middleware/auth'
import { searchKb, formatKbResultsForPrompt } from '../../../utils/kb-search'

/** 检查动态文件是否有实质性内容（至少2个核心字段非空） */
function hasSubstantiveData(df: any): boolean {
  if (!df) return false
  const fields = [df.positions, df.potentialInterests, df.batna, df.partyAnalysis, df.disputeChecklist, df.timeline]
  const filled = fields.filter(f => f && String(f).trim().length > 30).length
  return filled >= 2
}

/** 全量分析 prompt（原始版本） */
function buildFullPrompt(caseData: any, df: any): string {
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

${OUTPUT_FORMAT}`
}

/** 增量分析 prompt（动态文件已有数据时使用，更轻量） */
function buildLightPrompt(caseData: any, df: any): string {
  const safe = (v: any) => (v && String(v).trim()) || '（暂无）'
  return `## 角色
你是一位拥有 15 年以上经验的商事调解专家，专长"哈佛利益谈判法"。基于已有的分析结果，直接生成利益重构方案。

## 已有分析结果

### 案件标题
${safe(caseData.title)}

### 当事人
- 甲方：${safe(caseData.partyAName)}
- 乙方：${safe(caseData.partyBName)}

### 各方立场分析
${safe(df.positions)}

### 潜在利益点
${safe(df.potentialInterests)}

### BATNA 分析
${safe(df.batna)}

### 当事人特征分析
${safe(df.partyAnalysis)}

### 争议清单
${safe(df.disputeChecklist)}

### 时间线
${safe(df.timeline)}

${OUTPUT_FORMAT}`
}

const OUTPUT_FORMAT = `## 任务
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

/** 从报告文本中提取关键段落，写回动态文件 */
function extractForDynamicFile(reportText: string): Partial<{
  positions: string
  potentialInterests: string
  batna: string
  partyAnalysis: string
  disputeChecklist: string
}> {
  const result: Record<string, string> = {}

  // 一、案件关键信息摘要 → positions
  const sec1 = reportText.match(/一[、.]案件关键信息摘要([\s\S]*?)(?=二[、.]|$)/)
  if (sec1?.[1]) result.positions = sec1[1].trim()

  // 六、BATNA / WATNA → batna
  const sec6 = reportText.match(/六[、.]BATNA[\s\S]*?对比([\s\S]*?)(?=七[、.]|$)/)
  if (sec6?.[1]) result.batna = sec6[1].trim()

  // 七、推荐方案与理由 → potentialInterests
  const sec7 = reportText.match(/七[、.]推荐方案与理由([\s\S]*?)(?=八[、.]|$)/)
  if (sec7?.[1]) result.potentialInterests = sec7[1].trim()

  return result
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

  // ── 判断：动态文件是否有足够数据？──────────────────────
  const useLightMode = hasSubstantiveData(df)
  console.log(`[recommend-solution] case=${caseNumber} mode=${useLightMode ? 'LIGHT(动态文件)' : 'FULL(全量分析)'}`)

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

  // ── 选择 prompt 模式 ────────────────────────────────────
  const prompt = useLightMode ? buildLightPrompt(caseData, df) : buildFullPrompt(caseData, df)

  const result = await generateText({
    model: openai(config.openaiModel || 'gpt-4o-mini'),
    system: systemPrompt,
    prompt,
    temperature: 0.4,
  })

  // ── 写回动态文件（增量更新） ────────────────────────────
  try {
    const extracted = extractForDynamicFile(result.text)
    if (Object.keys(extracted).length > 0) {
      const now = new Date()
      if (df) {
        // Only update truly empty fields — never overwrite substantive existing data
        const updates: Record<string, string> = {}
        for (const [key, val] of Object.entries(extracted)) {
          const existing = df[key as keyof typeof df]
          const existingLen = existing ? String(existing).trim().length : 0
          // Only write if existing field is empty or very short (<50 chars)
          if (val && val.trim().length > 50 && existingLen < 50) {
            updates[key] = val
          }
        }
        if (Object.keys(updates).length > 0) {
          db.update(caseDynamicFiles).set({ ...updates, updatedAt: now }).where(eq(caseDynamicFiles.caseId, caseNumber)).run()
          console.log(`[recommend-solution] 写回动态文件: ${Object.keys(updates).join(', ')}`)
        }
      } else {
        // 创建新的动态文件
        db.insert(caseDynamicFiles).values({
          id: caseNumber,
          caseId: caseNumber,
          ...extracted,
          createdAt: now,
          updatedAt: now,
          dialogEnded: false,
          dialogTurnCount: 0,
        }).run()
        console.log(`[recommend-solution] 创建动态文件: ${Object.keys(extracted).join(', ')}`)
      }
    }
  } catch (err) {
    console.warn('[recommend-solution] 写回动态文件失败:', err)
  }

  return {
    success: true,
    data: {
      caseId: caseNumber,
      content: result.text,
      generatedAt: new Date().toISOString(),
      mode: useLightMode ? 'light' : 'full',
    },
  }
})
