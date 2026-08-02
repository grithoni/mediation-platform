// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],

  colorMode: {
    preference: 'system',
    fallback: 'light',
  },

  nitro: {
    experimental: {
      websocket: true,
    },
  },

  devServer: {
    host: '0.0.0.0',
    port: 6080,
  },

  vite: {
    cacheDir: 'node_modules/.cache/vite',
  },

  runtimeConfig: {
    // Server-side only
    databasePath: './.data/mediation.db',
    openaiApiKey: '',
    openaiBaseUrl: '',
    openaiModel: 'deepseek-v4-pro',
    // nanobot AI 引擎（OpenAI 兼容 API）
    nanobotBaseUrl: 'http://127.0.0.1:8900/v1',
    nanobotModel: 'deepseek-v4-flash',
    localNerBaseUrl: 'http://127.0.0.1:11434',
    localNerModel: '',
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
