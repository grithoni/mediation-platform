export interface AuthUser {
  id: string
  name: string
  username: string
  role: string
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)
  const isLoading = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  /**
   * Fetch current user from /api/auth/me
   */
  async function fetchUser(): Promise<AuthUser | null> {
    isLoading.value = true
    try {
      const data = await $fetch<{ success: boolean; user: AuthUser }>('/api/auth/me', {
        credentials: 'include',
      })
      user.value = data.user
      return data.user ?? null
    }
    catch {
      user.value = null
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
      const data = await $fetch<{ success: boolean; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
        credentials: 'include',
      })
      if (!data.success) {
        throw new Error('登录失败')
      }
      user.value = data.user
      return data.user
    }
    catch (err: any) {
      user.value = null
      throw new Error(err?.data?.message || err?.message || '登录失败，请检查用户名和密码')
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Logout and redirect to admin login
   */
  async function logout(): Promise<void> {
    isLoading.value = true
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    }
    catch {
      // Ignore logout errors
    }
    finally {
      user.value = null
      isLoading.value = false
      await navigateTo('/admin')
    }
  }

  return {
    user,
    isAuthenticated,
    login,
    logout,
    fetchUser,
    isLoading,
  }
}
