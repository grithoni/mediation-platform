export type ActiveMenu = 'case-entry' | 'mediation' | 'evaluation' | 'review'

export const useActiveMenu = () => {
  const activeMenu = useState<ActiveMenu>('party-active-menu', () => 'case-entry')

  function setMenu(menu: ActiveMenu) {
    activeMenu.value = menu
  }

  return { activeMenu, setMenu }
}
