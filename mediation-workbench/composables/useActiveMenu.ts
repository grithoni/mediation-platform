export type ActiveMenu = 'case-entry' | 'create-case'

/**
 * 当事人侧「进入我的案件 / 创建新的案件」模式状态。
 * 支持通过 URL 查询参数 ?mode=create 直接进入创建模式（官网「开始调解/我要调解」
 * 链接即使用 /party?mode=create）；未指定时默认进入案件查询模式。
 */
export const useActiveMenu = () => {
  const route = useRoute()
  const router = useRouter()

  const activeMenu = useState<ActiveMenu>('party-active-menu', () => {
    return route.query.mode === 'create' ? 'create-case' : 'case-entry'
  })

  function setMenu(menu: ActiveMenu) {
    activeMenu.value = menu
    // 导航到 /party 并同步 URL 模式，保证从任意页面（如案件详情）切换菜单都能跳转
    if (menu === 'create-case') {
      router.push({ path: '/party', query: { mode: 'create' } })
    } else {
      router.push({ path: '/party' })
    }
  }

  // URL 变化时跟随（例如直接访问 /party?mode=create）
  watch(
    () => route.query.mode,
    (mode) => {
      if (mode === 'create') activeMenu.value = 'create-case'
      else if (mode === undefined || mode === 'case-entry') activeMenu.value = 'case-entry'
    }
  )

  return { activeMenu, setMenu }
}
