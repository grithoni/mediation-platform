import { buildWorkflowBundle } from './case-analysis-orchestrator'

export async function buildPublicCaseAnalysisMaterials(caseNumber: string): Promise<string> {
  const bundle = await buildWorkflowBundle(caseNumber)
  return bundle.materials
}
