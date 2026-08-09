// ============================================================
// LLM-as-judge 评估器
// 用 DeepSeek 对技能输出按 rubric 打分，返回各维度分数、要点覆盖与置信度
// ============================================================
import { llmChat } from '../utils/llm'
import type { EvalSample, EvalRubric } from './dataset'

export interface JudgeDimensionResult {
  key: string
  name: string
  score: number
  maxScore: number
  comment: string
}

export interface JudgeResult {
  sampleId: string
  skillId: string
  dimensions: JudgeDimensionResult[]
  totalScore: number
  maxTotal: number
  /** 0-1 归一化分数 */
  normalized: number
  missingPoints: string[]
  hallucinations: string[]
  confidence: number
  /** 评估是否成功完成（false=超时/解析失败，分数不可信） */
  evaluated: boolean
  rawJson: string
}

const JUDGE_SYSTEM = `你是调解 AI 输出质量的资深评估员。你将对调解助手的回答进行结构化评分。
要求：
1. 严格基于提供的输入材料与评估要求判断，不自行脑补。
2. 每个维度给出 0 到 maxScore 的整数或半分。
3. 用 JSON 输出，格式见下，不要输出 JSON 以外的任何内容。
JSON 格式：
{
  "dimensions": [{"key": "...", "score": 0, "comment": "..."}],
  "missingPoints": ["输入材料中的重要信息在回答中遗漏的"],
  "hallucinations": ["材料中没有但回答中出现的断言"],
  "confidence": 0.0
}`

function parseJsonLoose(text: string): Record<string, unknown> | null {
  try {
    // 剥离 markdown 代码块围栏
    const cleaned = text.replace(/```(?:json)?/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    // 兜底：尝试正则提取最外层对象（防止文本中夹杂其他花括号）
    try {
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return null
      return JSON.parse(m[0])
    } catch {
      return null
    }
  }
}

export async function judgeOutput(opts: {
  sample: EvalSample
  rubric: EvalRubric
  output: string
  /** 覆盖 sample.materials：评估真实案件输出时传入该案件的输入材料 */
  materials?: string
  /** 运行时模式：只做幻觉/材料一致性检测，不做要点覆盖评分（用于真实案件输出） */
  runtimeMode?: boolean
  temperature?: number
}): Promise<JudgeResult> {
  const { sample, rubric, output } = opts
  const inputMaterials = opts.materials ?? sample.materials

  const dimensionPrompt = rubric.dimensions
    .map((d) => `- ${d.key}（${d.name}）：满分 ${d.maxScore}`)
    .join('\n')

  // 运行时模式：不注入样例特定要点，评分只依据"输入材料 + 输出一致性 + 任务形态"
  const expectedSection = opts.runtimeMode
    ? `## 评估要求
请根据「评分维度」评估模型输出在本次任务中的完成质量：
- 输出应准确反映输入材料中的事实，不遗漏材料中的重要信息；
- 不得输出输入材料中不存在的断言（幻觉）；
- 结构应符合「期望形态」。`
    : `## 期望回答应覆盖的要点
${sample.expectedPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`

  const prompt = `## 输入材料
${inputMaterials}

${expectedSection}

## 易错点（重点检查是否出现）
${sample.pitfallPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## 期望形态
${sample.expectedForm || '（未指定）'}

## 待评估的模型输出
---
${output}
---

## 评分维度（请对每个维度打分）
${dimensionPrompt}

请输出 JSON 评分结果。`

  const raw = await llmChat({
    system: JUDGE_SYSTEM,
    prompt,
    temperature: opts.temperature ?? 0.2,
    maxTokens: 5000,
    timeoutMs: 180_000,
  })

  // 评估不可用（超时/空返回）：标记，避免误判为 0 分
  if (!raw || !raw.trim()) {
    return {
      sampleId: sample.id,
      skillId: sample.skillId,
      dimensions: rubric.dimensions.map((d) => ({
        key: d.key, name: d.name, score: 0, maxScore: d.maxScore, comment: '评估超时/无返回',
      })),
      totalScore: 0,
      maxTotal: rubric.dimensions.reduce((s, d) => s + d.maxScore, 0),
      normalized: 0,
      missingPoints: [],
      hallucinations: [],
      confidence: 0,
      evaluated: false,
      rawJson: '',
    }
  }

  const parsed = parseJsonLoose(raw)

  const parsedDims = (parsed?.dimensions as Array<Record<string, unknown>> | undefined) || []
  const dims: JudgeDimensionResult[] = rubric.dimensions.map((d, di) => {
    // 优先按 key 匹配；失败时按顺序对齐（模型可能对 key 命名有偏差）
    const match = parsedDims.find((f) => f.key === d.key) ?? parsedDims[di]
    const score = typeof match?.score === 'number' ? Math.max(0, Math.min(d.maxScore, match.score)) : 0
    return {
      key: d.key,
      name: d.name,
      score,
      maxScore: d.maxScore,
      comment: typeof match?.comment === 'string' ? match.comment : '',
    }
  })

  const totalScore = dims.reduce((s, d) => s + d.score, 0)
  const maxTotal = rubric.dimensions.reduce((s, d) => s + d.maxScore, 0)
  const missingPoints = Array.isArray(parsed?.missingPoints) ? parsed.missingPoints as string[] : []
  const hallucinations = Array.isArray(parsed?.hallucinations) ? parsed.hallucinations as string[] : []
  const confidence = typeof parsed?.confidence === 'number' ? parsed.confidence : 0

  return {
    sampleId: sample.id,
    skillId: sample.skillId,
    dimensions: dims,
    totalScore,
    maxTotal,
    normalized: maxTotal > 0 ? totalScore / maxTotal : 0,
    missingPoints,
    hallucinations,
    confidence,
    evaluated: true,
    rawJson: raw,
  }
}
