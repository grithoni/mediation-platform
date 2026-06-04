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
  },

  vite: {
    cacheDir: 'node_modules/.cache/vite',
  },

  runtimeConfig: {
    // Server-side only
    databasePath: './.data/mediation.db',
    openaiApiKey: '',
    openaiBaseUrl: '',
    openaiModel: 'gpt-4o-mini',
    // Public (exposed to client)
    public: {
      appName: '全时在线的争议解决专家',
      appMode: 'party',
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
})
