// ============================================================
// server/utils/ai-welcome.ts
// 异步生成 AI 首次欢迎消息（材料审查），存到 messages 表
// 供 create.post.ts 和 init-dynamic-files.ts 共享使用
// ============================================================
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { getDb } from '../database'
import { cases, messages, documents } from '../database/schema'
import { searchKb } from './kb-search'

export async function createAiWelcomeForCase(caseNumber: string): Promise<void> {
  const db = getDb()
  const caseData = db.select().from(cases).where(eq(cases.id, caseNumber)).get()
  if (!caseData) return

  const config = useRuntimeConfig()
  if (!config.openaiApiKey) return

  // 检查是否已经有 AI 消息（避免重复）
  const existing = db.select().from(messages).where(eq(messages.caseId, caseNumber)).all()
  if (existing.some(m => m.senderType === 'ai' && m.content && m.content.length > 50)) return

  // 读取案件材料
  const docs = db.select().from(documents).where(eq(documents.caseId, caseNumber)).all()
  let fileContent = ''
  for (const doc of docs.slice(0, 2)) {
    try {
      const lower = doc.originalName.toLowerCase()
      let text = ''
      if (lower.endsWith('.pdf')) {
        text = execSync(`pdftotext -layout "${doc.path}" -`, { encoding: 'utf-8', timeout: 10000, maxBuffer: 5 * 1024 * 1024 })
      } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
        text = execSync(`textutil -convert txt -stdout "${doc.path}"`, { encoding: 'utf-8', timeout: 10000, maxBuffer: 5 * 1024 * 1024 })
      } else {
        text = readFileSync(doc.path, 'utf-8')
      }
      fileContent += `\n【${doc.originalName}】\n${text.slice(0, 3000)}\n`
    } catch {}
  }

  // 检索广仲仲裁规则
  let rulesContext = ''
  try {
    const rulesResults = await searchKb('广州仲裁委员会仲裁规则 申请仲裁 材料要求 第18条 第19条 第20条 第21条 第22条', 3)
    if (rulesResults.length > 0) {
      rulesContext = rulesResults.slice(0, 2).map(r => r.content.slice(0, 600)).join('\n---\n')
    }
  } catch {}

  const name = caseData.partyAName && caseData.partyAName !== '当事人' ? caseData.partyAName : ''
  const greeting = name ? `${name}先生您好` : '您好'

  const reviewPrompt = [
    '你是一位严格的仲裁材料审查员。请根据下方案件材料与《广州仲裁委员会仲裁规则》第18-22条，找出2-4条具体的材料缺陷或缺失。',
    '',
    '材料：',
    '案件：' + caseData.title,
    caseData.description ? '描述：' + caseData.description : '',
    fileContent ? '材料原文：' + fileContent : '',
    rulesContext ? '仲裁规则参考：' + rulesContext : '',
    '',
    '严格按以下JSON格式输出（用 markdown json 代码块包裹）：',
    '```json',
    '{"issues":["问题1","问题2","问题3"]}',
    '```',
    '',
    '每条问题20-60字，必须具体指出缺失什么材料。',
  ].filter(Boolean).join('\n')

  const { generateText } = await import('ai')
  const { createOpenAI } = await import('@ai-sdk/openai')
  const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey: config.openaiApiKey as string }
  if (config.openaiBaseUrl) openaiOptions.baseURL = config.openaiBaseUrl as string
  const openai = createOpenAI(openaiOptions)

  const result = await generateText({
    model: openai((config.openaiModel as string) || 'deepseek-v4-pro'),
    system: '你是仲裁材料审查助手。只输出JSON。',
    messages: [{ role: 'user' as const, content: reviewPrompt }],
    temperature: 0.3,
    maxTokens: 500,
  })

  let issues: string[] = []
  try {
    const jsonMatch = result.text.trim().match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      issues = (parsed.issues || []).slice(0, 4)
    }
  } catch {
    issues = result.text.split(/\n/).filter((l: string) => l.trim()).slice(0, 4)
  }
  console.log(`[createAiWelcome] ${caseNumber}: 提取到 ${issues.length} 个问题`)

  const numbers = ['一', '二', '三', '四']
  const issuesText = issues.length > 0
    ? issues.map((issue: string, i: number) => `${numbers[i]}、${issue.replace(/^[一二三四]、?\s*/, '')}`).join('\n')
    : '目前暂未发现明显问题，我们将进一步分析材料。'

  const welcomeContent = `${greeting}：

AI助手已审核您的材料，有如下问题需要和您核实。
${issuesText}

请就上述问题逐一回复，以便我们进一步完善案件材料。`

  const { v4: uuidv4 } = await import('uuid')
  db.insert(messages).values({
    id: uuidv4(),
    caseId: caseNumber,
    senderType: 'ai',
    senderId: 'mediation-ai',
    senderName: '调解AI助手',
    content: welcomeContent,
    visibility: 'private',
    createdAt: Date.now(),
  }).run()

  console.log(`[createAiWelcome] ${caseNumber}: AI欢迎消息已生成（${welcomeContent.length}字）`)
}
