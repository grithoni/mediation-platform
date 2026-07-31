// POST /api/cases/extract-info
// Upload files → parse → AI extracts party/respondent/案由/description
import { execSync } from 'node:child_process'
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { searchKb } from '../../utils/kb-search'

function parseDocument(filename: string, buffer: Buffer): string {
  const lower = filename.toLowerCase()
  const tmpDir = resolve(tmpdir(), 'mediation-extract')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
  const tmpPath = resolve(tmpDir, filename.replace(/[^a-zA-Z0-9._-]/g, '_'))
  
  try {
    writeFileSync(tmpPath, buffer)

    if (lower.endsWith('.pdf')) {
      return execSync(`pdftotext -layout "${tmpPath}" -`, { encoding: 'utf-8', timeout: 10000, maxBuffer: 5 * 1024 * 1024 })
    }
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      return execSync(`textutil -convert txt -stdout "${tmpPath}"`, { encoding: 'utf-8', timeout: 10000, maxBuffer: 5 * 1024 * 1024 })
    }

    // Plain text: try UTF-8
    const text = buffer.toString('utf-8')
    if (!text.includes('\ufffd')) return text
    return buffer.toString('latin1')
  } catch (err: any) {
    console.warn(`[extract-info] Failed to parse ${filename}:`, err.message)
    // Fallback: try raw UTF-8
    return buffer.toString('utf-8').slice(0, 2000)
  } finally {
    try { unlinkSync(tmpPath) } catch {}
  }
}

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: '请上传至少一个文件' })
  }

  // Extract text from uploaded files
  const fileTexts: string[] = []
  for (const part of formData) {
    if (part.name !== 'files' || !part.filename || !part.data) continue
    const text = parseDocument(part.filename, Buffer.from(part.data))
    const cleanText = text.replace(/\x00/g, '').trim()
    if (cleanText.length > 20) {
      fileTexts.push(`【${part.filename}】\n${cleanText.slice(0, 4000)}`)
      console.log(`[extract-info] Parsed ${part.filename}: ${cleanText.length} chars`)
    }
  }

  if (fileTexts.length === 0) {
    throw createError({ statusCode: 400, message: '无法解析文件内容，请确认文件格式为PDF/DOCX/TXT' })
  }

  const materialText = fileTexts.join('\n\n').slice(0, 10000)

  // Search KB for 最高人民法院案由规定
  let kbCaseTypes = ''
  try {
    const kbResults = await searchKb('最高人民法院 民事案件案由规定 案由分类', 5, 'hybrid')
    if (kbResults.length > 0) {
      kbCaseTypes = '\n## 最高人民法院案由规定参考\n' + kbResults.slice(0, 3).map(r => r.content.slice(0, 500)).join('\n---\n')
    }
  } catch {}

  const config = useRuntimeConfig()
  if (!config.openaiApiKey) {
    return { success: true, data: { partyName: '', respondentName: '', caseType: '', description: '' } }
  }

  const prompt = `从以下法律/案件材料中提取信息。请参照最高人民法院《民事案件案由规定》确定案由。

${materialText}
${kbCaseTypes}

提取（无法确定留""）：
1. partyName: 申请人/原告/当事人姓名
2. respondentName: 被申请人/被告姓名
3. caseType: 案由，严格参照最高人民法院《民事案件案由规定》确定（如"教育培训合同纠纷"）
4. description: 简要描述，含纠纷类型、关键事实、争议金额、诉求（50-150字）

只输出: {"partyName":"...","respondentName":"...","caseType":"...","description":"..."}`

  try {
    const { generateText } = await import('ai')
    const { createOpenAI } = await import('@ai-sdk/openai')
    const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey: config.openaiApiKey as string }
    if (config.openaiBaseUrl) openaiOptions.baseURL = config.openaiBaseUrl as string
    const openai = createOpenAI(openaiOptions)

    const result = await generateText({
      model: openai((config.openaiModel as string) || 'deepseek-v4-pro'),
      system: '只返回JSON，不要其他文字。',
      messages: [{ role: 'user' as const, content: prompt }],
      temperature: 0.1,
      maxTokens: 500,
    })

    const text = result.text.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[extract-info] No JSON in response:', text.slice(0, 200))
      return { success: true, data: { partyName: '', respondentName: '', caseType: '', description: '' } }
    }

    const extracted = JSON.parse(jsonMatch[0])
    console.log(`[extract-info] Extracted: party=${extracted.partyName}, caseType=${extracted.caseType}, respondent=${extracted.respondentName}`)
    return { success: true, data: extracted }
  } catch (err: any) {
    console.error('[extract-info] AI extraction failed:', err.message)
    return { success: true, data: { partyName: '', respondentName: '', caseType: '', description: '' } }
  }
})
