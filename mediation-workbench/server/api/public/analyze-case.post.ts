// ============================================================
// server/api/public/analyze-case.post.ts
// 案件分析（SSE 流式）
//
// 契约：
//   Body: { "case_id": "..." }
//   Response: SSE 流
//     data: {"status": "desensitizing"}\n\n
//     data: {"status": "analyzing"}\n\n
//     data: {"status": "restoring"}\n\n
//     data: {"content": "每 8 字符分块"}\n\n ...
//     data: [DONE]\n\n
//
// 流程：读工作台数据库 → 组装案件材料 → 本地脱敏 → LLM 6部分分析
//       → 反脱敏还原 → 按 8 字符分块 SSE 流式返回
//
// case_id 映射：
//   case_applications 表，CASE_DB_ID_FIELD=case_id
//   TEXT_FIELDS=case_facts,dispute_matters,mediation_demands,demands_basis
//   PARTIES_FIELDS=applicant_name,respondent_name
//   CASE_DB_ADDRESSES_FIELDS=applicant_address,respondent_address
//   → case_id 对应 workbench .data/mediation.db 的 case_applications.case_id（与 cases.id 相同）
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases, caseApplications } from '../../database/schema'
import { desensitizeCaseMaterials } from '../../utils/case-analysis-orchestrator'
import { llmChat } from '../../utils/llm'
import { buildPublicCaseAnalysisMaterials } from '../../utils/public-case-analysis'

// 案件分析系统提示词
const CASE_ANALYSIS_PROMPT = `你是「珠江国际商事调解院」的案情分析助手。请基于以下案件材料，进行结构化案情分析。

【硬性约束】
- 只以提供的案件材料为事实来源；材料未载明的事实一律写"材料未载明/无法判断"
- 金额、日期、主体信息等不自行推算、不补全、不猜测
- 需要用户补充时在第6部分点明缺口

【输出格式】严格按以下6部分输出（顺序固定，标题固定，使用 markdown 加粗标题）：

**一、案件基本信息**
（案由、争议金额、签约时间与履行地等，1-2条归纳句）

**二、当事人基本情况**
（申请人/被申请人、联系方式、代理人等，1-2条归纳句）

**三、本案仲裁请求分析**
（请求金额/计算方式、事实与证据效力、法律依据，展开要点）

**四、全案综合风险评估**
（重点风险、证据缺口、抗辩焦点，详细清单）

**五、解纷策略建议**
（优先调解路径、时间/经济成本考量，详细清单）

**六、补充说明**
（需补充的材料、注意事项，不超过300字）

【要求】
- 每部分用"归纳句/要点句"，不截断原文
- 第4、5部分要详细，列出重点风险和优先处置路径
- 使用简体中文，条目化排版
- 不要在回答中提及"脱敏""令牌""材料原文"等技术细节`

/**
 * 反脱敏还原：将分析结果中的令牌替换回真实 PII。
 * 实现与 server/utils/case-analysis-orchestrator.ts 的 restoreText（732-738 行）一致，
 * 但该函数未导出，此处内联最小实现以保持端点自包含（不改动已有文件）。
 */
function restoreText(text: string, mapping: Record<string, string>): string {
  let restored = text
  for (const [token, value] of Object.entries(mapping).sort((a, b) => b[0].length - a[0].length)) {
    restored = restored.replaceAll(token, value)
  }
  return restored
}

// 按 8 字符分块，保留 markdown 结构
function chunkBy(text: string, size = 8): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const caseId = String(body?.case_id ?? '').trim()
  if (!caseId) {
    throw createError({ statusCode: 400, statusMessage: '案件编号不能为空' })
  }

  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'X-Accel-Buffering', 'no')

  const encoder = new TextEncoder()
  const send = (payload: Record<string, string>) =>
    encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── 1. 脱敏 ──────────────────────────────────────
        controller.enqueue(send({ status: 'desensitizing' }))

        const db = getDb()

        // 查询案件材料：case_id → case_applications.case_id
        const application = db
          .select()
          .from(caseApplications)
          .where(eq(caseApplications.caseId, caseId))
          .get()
        const caseData = db.select().from(cases).where(eq(cases.id, caseId)).get()

        if (!application && !caseData) {
          // 案件不存在时输出错误
          throw new Error(`案件不存在: ${caseId}`)
        }

        // 组装案件材料（含案件表单与附件正文）
        const partyNames = Array.from(
          new Set(
            [
              caseData?.partyAName,
              caseData?.partyBName,
              application?.applicantName,
              application?.respondentName,
              application?.agentName,
            ].filter((name): name is string => !!name),
          ),
        )

        const addresses = Array.from(
          new Set(
            [application?.applicantAddress, application?.respondentAddress].filter(
              (addr): addr is string => !!addr,
            ),
          ),
        )

        const knownEntities: Array<{ value: string; category: string }> = []
        if (caseData?.partyAName) knownEntities.push({ value: caseData.partyAName, category: '申请人' })
        if (caseData?.partyBName) knownEntities.push({ value: caseData.partyBName, category: '被申请人' })
        if (application?.agentName) knownEntities.push({ value: application.agentName, category: '委托代理人' })
        for (const address of addresses) knownEntities.push({ value: address, category: '地址' })

        const materials = await buildPublicCaseAnalysisMaterials(caseId)

        // 本地脱敏（desensitizeCaseMaterials 已导出，返回结构含 mapping 供反脱敏使用）
        const desensitized = await desensitizeCaseMaterials(materials, {
          knownEntities,
          partyNames,
          addresses,
        })

        // ── 2. 分析 ──────────────────────────────────────
        controller.enqueue(send({ status: 'analyzing' }))
        const analysis = await llmChat({
          system: CASE_ANALYSIS_PROMPT,
          prompt: `案件编号：${caseId}\n\n案件材料：\n${desensitized.maskedText}`,
          temperature: 0.3,
          maxTokens: 3200,
        })

        // ── 3. 反脱敏 ────────────────────────────────────
        controller.enqueue(send({ status: 'restoring' }))
        let restored = analysis
        try {
          restored = restoreText(analysis, desensitized.mapping || {})
        } catch (e) {
          console.error('[public/analyze-case] 反脱敏失败，使用脱敏结果:', e)
        }

        // ── 4. 流式返回还原后的分析（每 8 字符分块）──────
        for (const chunk of chunkBy(restored)) {
          controller.enqueue(send({ content: chunk }))
        }
      } catch (e: any) {
        console.error('[public/analyze-case] 失败:', e)
        const err = `案件分析失败：${e?.message || e}。请确认案件编号正确，或拨打 020-83288530 联系工作人员。`
        controller.enqueue(send({ content: err }))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return stream
})
