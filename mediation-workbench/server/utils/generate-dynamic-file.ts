// ============================================================
// server/utils/generate-dynamic-file.ts
// 统一走主流程编排：本地脱敏 -> 云端 skills 分析 -> 反脱敏 -> 写回动态文件
// ============================================================
import { generateDynamicFileWorkflow } from './case-analysis-orchestrator'

export async function generateDynamicFile(
  caseNumber: string,
  options: { force?: boolean } = {},
): Promise<{ generated: string[]; skipped: string[]; reason?: string }> {
  return generateDynamicFileWorkflow(caseNumber, options)
}
