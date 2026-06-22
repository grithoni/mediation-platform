export interface AuthUser {
  id: string
  name: string
  username: string
  role: string
  email?: string
  phone?: string
  tenantId?: string
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)
  const token = useState<string | null>('auth-token', () => null)
  const isLoading = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  /**
   * 从 localStorage 恢复 token
   */
  function restoreToken() {
    if (import.meta.client) {
      const savedToken = localStorage.getItem('auth-token')
      if (savedToken) {
        token.value = savedToken
      }
    }
  }

  /**
   * 获取请求头（包含 JWT token）
   */
  function getAuthHeaders(): Record<string, string> {
    if (token.value) {
      return { Authorization: `Bearer ${token.value}` }
    }
    return {}
  }

  /**
   * Fetch current user from /api/auth/me
   */
  async function fetchUser(): Promise<AuthUser | null> {
    isLoading.value = true
    try {
      // 先尝试恢复 token
      if (!token.value) {
        restoreToken()
      }

      const data = await $fetch<{ success: boolean; data: { user: AuthUser } }>('/api/auth/me', {
        headers: getAuthHeaders(),
      })
      user.value = data.data.user
      return data.data.user ?? null
    }
    catch {
      user.value = null
      token.value = null
      if (import.meta.client) {
        localStorage.removeItem('auth-token')
      }
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Login with username/password
   */
  async function login(username: string, password: string): Promise<AuthUser> {
    isLoading.value = true
    try {
      const data = await $fetch<{ success: boolean; data: { user: AuthUser; token: string } }>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      if (!data.success) {
        throw new Error('登录失败')
      }

      // 保存 token
      token.value = data.data.token
      if (import.meta.client) {
        localStorage.setItem('auth-token', data.data.token)
      }

      user.value = data.data.user
      return data.data.user
    }
    catch (err: any) {
      user.value = null
      token.value = null
      throw new Error(err?.data?.message || err?.message || '登录失败，请检查用户名和密码')
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Register new user
   */
  async function register(data: {
    name: string
    username: string
    password: string
    email?: string
    phone?: string
    role?: string
  }): Promise<AuthUser> {
    isLoading.value = true
    try {
      const result = await $fetch<{ success: boolean; data: { user: AuthUser; token: string } }>('/api/auth/register', {
        method: 'POST',
        body: data,
      })
      if (!result.success) {
        throw new Error('注册失败')
      }

      // 保存 token
      token.value = result.data.token
      if (import.meta.client) {
        localStorage.setItem('auth-token', result.data.token)
      }

      user.value = result.data.user
      return result.data.user
    }
    catch (err: any) {
      throw new Error(err?.data?.message || err?.message || '注册失败')
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Logout
   */
  async function logout(): Promise<void> {
    isLoading.value = true
    try {
      await $fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      })
    }
    catch {
      // Ignore logout errors
    }
    finally {
      user.value = null
      token.value = null
      if (import.meta.client) {
        localStorage.removeItem('auth-token')
      }
      isLoading.value = false
      await navigateTo('/mediator')
    }
  }

  return {
    user,
    token,
    isAuthenticated,
    login,
    register,
    logout,
    fetchUser,
    isLoading,
    getAuthHeaders,
  }
}
