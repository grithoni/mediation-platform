export type ActiveMenu = 'case-entry' | 'create-case' | 'guide'

export const useActiveMenu = () => {
  const activeMenu = useState<ActiveMenu>('party-active-menu', () => 'case-entry')

  function setMenu(menu: ActiveMenu) {
    activeMenu.value = menu
  }

  return { activeMenu, setMenu }
}
