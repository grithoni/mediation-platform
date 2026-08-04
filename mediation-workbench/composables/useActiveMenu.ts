export type ActiveMenu = 'case-entry' | 'create-case'

/**
 * 当事人侧「进入我的案件 / 创建新的案件」模式状态。
 * 支持通过 URL 查询参数 ?mode=create 直接进入创建模式（官网「开始调解/我要调解」
 * 链接即使用 /apply?mode=create）；未指定时默认进入案件查询模式。
 */
export const useActiveMenu = () => {
  const route = useRoute()
  const router = useRouter()

  const activeMenu = useState<ActiveMenu>('party-active-menu', () => {
    return route.query.mode === 'create' ? 'create-case' : 'case-entry'
  })

  function setMenu(menu: ActiveMenu) {
    activeMenu.value = menu
    // 同步 URL，保证刷新后仍停留在当前模式
    if (menu === 'create-case') {
      router.replace({ query: { ...route.query, mode: 'create' } })
    } else {
      const q = { ...route.query }
      delete q.mode
      router.replace({ query: q })
    }
  }

  // URL 变化时跟随（例如直接访问 /apply?mode=create）
  watch(
    () => route.query.mode,
    (mode) => {
      if (mode === 'create') activeMenu.value = 'create-case'
      else if (mode === undefined || mode === 'case-entry') activeMenu.value = 'case-entry'
    }
  )

  return { activeMenu, setMenu }
}
