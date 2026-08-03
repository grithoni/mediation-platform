// ============================================================
// GET /api/ai/status — 内置 AI 引擎健康状态（只读，不触发 spawn）
// ============================================================
import { aiEngineStatus, engineLogTail } from '../../utils/ai-engine-manager'

export default defineEventHandler(async () => {
  const status = await aiEngineStatus()
  return {
    success: true,
    engine: 'nanobot (vendored)',
    healthy: status.healthy,
    status: status.status,
    detail: status.detail || null,
    logTail: status.healthy ? undefined : engineLogTail(15),
  }
})
