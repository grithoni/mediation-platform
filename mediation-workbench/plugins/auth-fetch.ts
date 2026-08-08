// 全局 $fetch 拦截器：自动注入 JWT token，避免各页面手动传 getAuthHeaders() 遗漏
// 用法：页面/组件中用 $api() 代替 $fetch()，自动携带 Authorization 头
export default defineNuxtPlugin(() => {
  const token = useState<string | null>('auth-token', () => null)

  // 客户端启动时从 localStorage 恢复 token
  if (import.meta.client) {
    const saved = localStorage.getItem('auth-token')
    if (saved) {
      token.value = saved
    }
  }

  const api = $fetch.create({
    onRequest({ options }) {
      if (token.value) {
        options.headers = {
          ...(options.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token.value}`,
        }
      }
    },
  })

  return {
    provide: {
      api,
    },
  }
})