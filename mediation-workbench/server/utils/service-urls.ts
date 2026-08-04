// ============================================================
// server/utils/service-urls.ts
// OCR / KB 微服务地址解析：环境变量 > Nuxt runtimeConfig > 本地开发默认值
//
// 环境变量：OCR_URL / KB_URL（也可用 Nuxt 约定的 NUXT_OCR_URL / NUXT_KB_URL，
// 会被自动映射进 runtimeConfig.ocrUrl / runtimeConfig.kbUrl）
// ============================================================

/** 安全读取 Nuxt runtimeConfig（独立 MP 进程无 useRuntimeConfig 时返回 null） */
function safeRuntimeConfig(): Record<string, any> | null {
  try {
    const rc = (useRuntimeConfig as unknown as (() => Record<string, any>))?.()
    return rc ?? null
  } catch {
    return null
  }
}

/** 知识库服务地址（Python FastAPI KB server，默认本地 8700） */
export function getKbUrl(): string {
  return process.env.KB_URL || safeRuntimeConfig()?.kbUrl || 'http://localhost:8700'
}

/** OCR 微服务地址（默认本地 8701） */
export function getOcrUrl(): string {
  return process.env.OCR_URL || safeRuntimeConfig()?.ocrUrl || 'http://localhost:8701'
}
