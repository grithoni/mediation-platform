// ============================================================
// server/plugins/ai-engine.ts
// Nitro 生命周期管理：作为项目内置 AI 引擎的唯一 spawn owner。
//
//   - 工作台启动时健康检查 http://127.0.0.1:8900/health
//   - 无健康实例时启动 .venv-ai/bin/python -m nanobot serve
//     --config .data/ai/config.json --host 127.0.0.1 --port 8900
//   - 等待 /health；记录 PID/日志
//   - 工作台退出（nitro close）时 SIGTERM 并清理
//   - 不重复启动；adopt 已健康实例；不杀外部健康实例
//
// 独立 MP 进程（server/mp）只探测不 spawn，避免双重 spawn。
// ============================================================

import { initAiEngine, ensureAiEngine, stopAiEngine } from '../utils/ai-engine-manager'

export default defineNitroPlugin((nitro) => {
  // 路径基于项目根目录（与 .data/mediation.db 一致，均相对 cwd）
  initAiEngine({
    host: '127.0.0.1',
    port: 8900,
    pythonPath: '.venv-ai/bin/python',
    configPath: '.data/ai/config.json',
    pidFile: '.data/ai/engine.pid',
    logFile: '.data/ai/engine.log',
    startTimeoutMs: 40_000,
  })

  // 延迟启动，不阻塞工作台自身启动
  setTimeout(() => {
    ensureAiEngine()
      .then((s) => {
        if (!s.healthy) {
          console.warn(`[ai-engine] 启动失败: ${s.status}${s.detail ? `\n${s.detail}` : ''}`)
        }
      })
      .catch((err) => {
        console.warn('[ai-engine] 启动异常:', err)
      })
  }, 800)

  // 工作台退出时清理（只清理本项目记录的 PID）。
  // close hook 类型为 () => HookResult（void | Promise<void>），
  // 用 async 回调 await 引擎真正退出，避免进程退出时仍残留引擎。
  nitro.hooks.hook('close', async () => {
    await stopAiEngine()
  })
})
