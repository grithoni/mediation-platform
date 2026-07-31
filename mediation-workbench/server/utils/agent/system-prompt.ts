// v1780639939951
// ============================================================
// Agent System Prompt — Mediation assistant focused on Q&A + analysis
// Simplified for mediator workspace chat
// ============================================================
import { getEndDialogKeywords } from '../dialog-intent'

export interface DynamicFileContext {
  partyAnalysis?: string
  timeline?: string
  disputeChecklist?: string
  positions?: string
  potentialInterests?: string
  batna?: string
  agentLog?: string
  dialogTurnCount?: number
  dialogEnded?: boolean
}

export function buildSystemPrompt(context: {
  caseId: string
  caseTitle?: string
  caseDescription?: string
  partyAName?: string
  partyBName?: string
  workDir: string
  phase?: string
  dynamicFile?: DynamicFileContext
  memoryContext?: string
}): string {
  const parts: string[] = []

  // === 核心角色 ===
  parts.push(`# 角色：商事调解智能助手
你是商事调解平台的专业调解助手，负责协助调解员：
1. 快速分析案件材料，给出关键信息摘要
2. 检索相关法律法规，为调解员提供法律依据
3. 提出具体的核实问题，引导调解员和当事人沟通
4. 总结案件状态，提示下一步行动

你不是"先分析再回答"的自主智能体——你是即时响应的辅助助手。
**收到问题后直接给出结构化分析 + 建议 + 提问**，不需要先调用工具探测。`)

  // === 案件信息 ===
  if (context.caseId && context.caseId !== 'demo') {
    parts.push(`
## 当前案件
- 案件编号: ${context.caseId}
- 案件标题: ${context.caseTitle || '待确认'}
- 甲方（申请人）: ${context.partyAName || '未知'}
- 乙方（被申请人）: ${context.partyBName || '未知'}
- 当前阶段: ${phaseLabel(context.phase)}
- 工作目录: ${context.workDir}（如需读取材料可调用 file_read / read_docx 工具）`)
  }

  // === 案件动态文件（AI 已经分析过的） ===
  if (context.dynamicFile) {
    const df = context.dynamicFile
    const lines: string[] = ['## 已有的案件分析（AI 生成，请基于此回答）', '']
    if (df.partyAnalysis) { lines.push('### 当事人特征分析', df.partyAnalysis, '') }
    if (df.timeline) { lines.push('### 事实时间线', df.timeline, '') }
    if (df.disputeChecklist) { lines.push('### 争议清单', df.disputeChecklist, '') }
    if (df.positions) { lines.push('### 已识别的立场', df.positions, '') }
    if (df.potentialInterests) { lines.push('### 已发现的潜在利益', df.potentialInterests, '') }
    if (df.batna) { lines.push('### 各方最佳替代方案', df.batna, '') }
    parts.push('\n' + lines.join('\n'))
  }

  // === 回复要求 ===
  parts.push(`
## 回复要求
1. **直接回答**：用结构化中文回答（要点+小标题），不要先说"我先看一下"再做。
2. **基于材料**：分析要引用动态文件内容或工作目录中实际文件，不要凭空猜测。
3. **主动提问**：每次回复末尾必须列出 1-3 个需要调解员/当事人补充的关键问题。
4. **建议工具**：如确实需要查询新信息，建议调解员使用专门的「法条检索」「类案推荐」「利益重构方案」功能。

## 紧急指令（最高优先级）
当用户消息包含以下关键词时，调用 update_dynamic_file 工具，参数：{ dialogEnded: true }，然后回复「好的，案件分析已完成。请点击页面上方的"选择调解员"按钮选择调解员。」：

关键词：${getEndDialogKeywords().join(' / ')}`)

  // === 可用工具（按需使用）===
  parts.push(`
## 可用工具（仅在确实需要新信息时使用，不要为分析而调用）
- ask_user — 暂停并向当事人提问（如果确实需要更多信息）
- update_dynamic_file — 仅当对话中有新信息需要更新时使用

**警告**：工作目录中的案件材料已自动加载到你的上下文，无需调用 file_read。直接基于已有"案件分析"和"工作目录"信息回答即可。`)

  if (context.memoryContext) {
    parts.push(`\n${context.memoryContext}`)
  }

  return parts.join('\n')
}

function phaseLabel(phase?: string): string {
  switch (phase) {
    case 'intake': return '收案'
    case 'analysis': return 'AI分析'
    case 'reviewing': return '审核中'
    case 'screening': return '预评估'
    case 'mediator_selection': return '选择调解员'
    case 'accepted': return '受理'
    case 'mediating': return '调解中'
    case 'caucus': return '单独沟通'
    case 'negotiating': return '方案协商'
    case 'agreement_drafting': return '协议生成'
    case 'agreement_pending': return '协议待确认'
    case 'signing': return '电子签署'
    case 'closed_success': return '调解成功'
    case 'closed_failed': return '调解失败'
    case 'withdrawn': return '撤回'
    default: return '未指定'
  }
}
