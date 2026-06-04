export type ActiveMenu = 'case-entry' | 'mediation' | 'evaluation' | 'review'

export const useActiveMenu = () => useState<ActiveMenu>('party-active-menu', () => 'case-entry')
