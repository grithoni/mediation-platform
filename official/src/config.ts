// ============================================================
// 官网运行时配置
//
// 官网与调解工作台（mediation-workbench，Nuxt，端口 6080）解耦，
// 所有 workbench / AI / OCR / KB 服务地址均可用环境变量覆盖：
//
//   PUBLIC_WORKBENCH_URL   调解工作台根地址（默认 http://localhost:6080）
//   PUBLIC_CHAT_API_URL    AI 智能咨询接口（默认 {WORKBENCH_URL}/api/public/chat）
//   PUBLIC_ANALYZE_API_URL 案件分析接口（默认 {WORKBENCH_URL}/api/public/analyze-case）
//   PUBLIC_OCR_URL         OCR 服务地址（默认 {WORKBENCH_URL}/api/ocr，经工作台代理）
//   PUBLIC_KB_URL          知识库服务地址（默认 {WORKBENCH_URL}/api/kb，经工作台代理）
//
// 生产环境设置示例：
//   PUBLIC_WORKBENCH_URL=https://mediation.example.com
//
// 注意：PUBLIC_ 前缀的变量会暴露到浏览器端，切勿放入任何密钥。
// ============================================================

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '')

/** 调解工作台根地址 */
export const WORKBENCH_URL = stripTrailingSlash(
  import.meta.env.PUBLIC_WORKBENCH_URL || 'http://localhost:6080'
)

/** AI 智能咨询（SSE 对话）接口 */
export const CHAT_API_URL = stripTrailingSlash(
  import.meta.env.PUBLIC_CHAT_API_URL || `${WORKBENCH_URL}/api/public/chat`
)

/** 案件分析（SSE）接口 */
export const ANALYZE_API_URL = stripTrailingSlash(
  import.meta.env.PUBLIC_ANALYZE_API_URL || `${WORKBENCH_URL}/api/public/analyze-case`
)

/** OCR 识别服务（默认经工作台 /api/ocr 代理） */
export const OCR_API_URL = stripTrailingSlash(
  import.meta.env.PUBLIC_OCR_URL || `${WORKBENCH_URL}/api/ocr`
)

/** 知识库服务（默认经工作台 /api/kb 代理） */
export const KB_API_URL = stripTrailingSlash(
  import.meta.env.PUBLIC_KB_URL || `${WORKBENCH_URL}/api/kb`
)
