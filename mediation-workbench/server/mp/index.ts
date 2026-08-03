import { createApp, createRouter, defineEventHandler, toNodeListener, createError } from 'h3'
import { createServer } from 'node:http'
import { authRoutes } from './routes/auth'
import { caseRoutes } from './routes/cases'
import { messageRoutes } from './routes/messages'
import { chatRoutes } from './routes/chat'
import { verifyMpToken } from './middleware/auth'

const PORT = Number(process.env.MP_PORT || 6081)

const app = createApp({
  onError: (error) => {
    console.error('[MP API]', error)
    return { success: false, error: error.message || 'Internal Server Error' }
  },
})

// CORS
app.use(defineEventHandler((event) => {
  const headers = event.node.req.headers
  if (headers.origin) {
    event.node.res.setHeader('Access-Control-Allow-Origin', headers.origin as string)
    event.node.res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    event.node.res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    event.node.res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  if (event.node.req.method === 'OPTIONS') {
    event.node.res.statusCode = 204
    event.node.res.end()
    return
  }
}))

// AI engine status — probe only, NEVER spawns (the Nitro plugin is the single
// spawn owner; this standalone process only reports). Shared by the /health/ai
// route and the startup probe.
async function reportAiEngineStatus() {
  const { aiEngineStatus } = await import('../utils/ai-engine-manager')
  const status = await aiEngineStatus()
  return {
    healthy: status.healthy,
    status: status.status,
    detail: status.detail || null,
    note: 'probe only — engine lifecycle is owned by the Nuxt server plugin',
  }
}

// 必须先于 /health 注册，否则 /health 会按前缀匹配吃掉 /health/ai。
app.use('/health/ai', defineEventHandler(() => reportAiEngineStatus()))

// Health
app.use('/health', defineEventHandler(() => ({
  status: 'ok',
  service: 'mediation-mp-api',
  timestamp: new Date().toISOString(),
})))

// Auth routes (no JWT)
const authRouter = createRouter()
authRoutes(authRouter)
app.use(authRouter.handler)

// JWT middleware for everything else under /api/mp
app.use('/api/mp', defineEventHandler(async (event) => {
  const authHeader = event.node.req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: '缺少认证令牌' })
  }
  const token = authHeader.slice(7)
  const payload = await verifyMpToken(token)
  if (!payload) {
    throw createError({ statusCode: 401, message: '令牌无效或已过期' })
  }
  event.context.mpUser = payload
}))

// Protected routes
const caseRouter = createRouter()
caseRoutes(caseRouter)
app.use(caseRouter.handler)

const messageRouter = createRouter()
messageRoutes(messageRouter)
app.use(messageRouter.handler)

const chatRouter = createRouter()
chatRoutes(chatRouter)
app.use(chatRouter.handler)

// Start server
const server = createServer(toNodeListener(app))
server.listen(PORT, () => {
  console.log(`[MP API] 小程序接口服务启动 http://localhost:${PORT}`)
  console.log(`[MP API] 健康检查: GET  http://localhost:${PORT}/health`)
  console.log(`[MP API] AI引擎状态: GET http://localhost:${PORT}/health/ai`)
  console.log(`[MP API] 登录接口: POST http://localhost:${PORT}/api/mp/auth/login`)
  console.log(`[MP API] 案件列表: GET  http://localhost:${PORT}/api/mp/cases`)
  console.log(`[MP API] 消息接口: GET  http://localhost:${PORT}/api/mp/messages/:caseId`)
  console.log(`[MP API] AI对话:   POST http://localhost:${PORT}/api/mp/chat`)
  // 启动时探测一次内置 AI 引擎状态并报告（不 spawn，避免与 Nitro 插件双重启动）
  reportAiEngineStatus()
    .then((s) => {
      console.log(`[MP API] 内置AI引擎: ${s.status}${s.detail ? ` (${s.detail})` : ''}`)
    })
    .catch((err: any) => {
      console.log(`[MP API] 内置AI引擎: 探测失败 ${err?.message || err}`)
    })
})
