// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],

  colorMode: {
    preference: 'system',
    fallback: 'light',
  },

  // @nuxt/schema 4.x 类型中移除了顶层 `nitro` 键，运行时仍生效；以展开方式传入避免类型报错
  ...({ nitro: { experimental: { websocket: true } } } as const),

  devServer: {
    host: '0.0.0.0',
    port: 6080,
  },

  // 排除 vendored Python 引擎 / venv / 运行时数据，避免文件监听器耗尽 fd（EMFILE）
  ignore: ['python/**', '.venv-ai/**', '.venv-kb/**', '.data/**'],

  vite: {
    cacheDir: 'node_modules/.cache/vite',
    server: {
      watch: {
        // 覆盖 chokidar ignored 时需保留 node_modules 等默认项
        ignored: [
          '**/python/**',
          '**/.venv-ai/**',
          '**/.venv-kb/**',
          '**/.data/**',
          '**/.git/**',
          '**/node_modules/**',
        ],
      },
    },
  },

  runtimeConfig: {
    // Server-side only
    databasePath: './.data/mediation.db',
    openaiApiKey: '',
    openaiBaseUrl: '',
    openaiModel: 'deepseek-v4-pro',
    // 内置 nanobot AI 引擎（OpenAI 兼容 API）——vendored engine，端口固定 8900
    // 客户端 server/utils/nanobot.ts 按 环境变量 > 此处 runtimeConfig > 默认值 解析，
    // 引擎进程由 server/plugins/ai-engine.ts 在项目内 .venv-ai + .data/ai/config.json 启动。
    nanobotBaseUrl: 'http://127.0.0.1:8900/v1',
    nanobotModel: 'deepseek-v4-flash',
    localNerBaseUrl: 'http://127.0.0.1:11434',
    localNerModel: '',
    // OCR / KB 微服务地址：环境变量（NUXT_OCR_URL / NUXT_KB_URL）可覆盖，默认指向本地开发服务
    ocrUrl: 'http://localhost:8701',
    kbUrl: 'http://localhost:8700',
    // Public (exposed to client)
    public: {
      appName: '全时在线的调解专家',
    },
  },

  // Disable Google fonts/icons to avoid network timeout
  ui: {
    fonts: false,
  },

  css: ['~/assets/css/main.css'],

  future: {
    compatibilityVersion: 4,
  },

  // TEMP: disable SSR due to EBADF in dev mode
  ssr: false,
})
