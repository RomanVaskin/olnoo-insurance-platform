import type { LucideIcon } from 'lucide-react'
import type { Account } from './auth'
import {
  LayoutDashboard,
  FileText,
  Layers,
  BadgeCheck,
  FileOutput,
  FileStack,
  FileScan,
  Inbox,
  Users,
  Building2,
  Wallet,
  PackageSearch,
  Settings,
  UserCog,
  Upload,
} from 'lucide-react'

export type NavItem = { label: string; href: string; icon: LucideIcon }

const superAdminNav: NavItem[] = [
  { label: 'Обзор', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Полисы', href: '/', icon: FileText },
  { label: 'Спортсмены', href: '/athletes', icon: Users },
  { label: 'Федерации', href: '/federations', icon: Building2 },
  { label: 'Страховые продукты', href: '/products', icon: PackageSearch },
  { label: 'Пулы номеров', href: '/pools', icon: Layers },
  { label: 'Выпущенные полисы', href: '/issued', icon: BadgeCheck },
  { label: 'Генератор PDF', href: '/pdf-generator', icon: FileOutput },
  { label: 'Шаблоны', href: '/templates', icon: FileStack },
  { label: 'Заявки', href: '/applications', icon: Inbox },
  { label: 'Документы', href: '/documents', icon: FileScan },
  { label: 'Платежи', href: '/payments', icon: Wallet },
  { label: 'Пользователи', href: '/users', icon: UserCog },
  { label: 'Импорт данных', href: '/import', icon: Upload },
  { label: 'Настройки', href: '/settings', icon: Settings },
]

const federationSecretaryNav: NavItem[] = [
  { label: 'Обзор', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Спортсмены', href: '/athletes', icon: Users },
  { label: 'Заявки', href: '/applications', icon: Inbox },
  { label: 'Полисы', href: '/policies', icon: FileText },
  { label: 'Документы', href: '/documents', icon: FileScan },
  { label: 'Страховые продукты', href: '/products', icon: PackageSearch },
]

const federationDirectorNav: NavItem[] = [
  ...federationSecretaryNav,
  { label: 'Платежи', href: '/payments', icon: Wallet },
]

const adminNav: NavItem[] = [
  { label: 'Обзор', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Заявки', href: '/applications', icon: Inbox },
  { label: 'Полисы', href: '/policies', icon: FileText },
  { label: 'Документы', href: '/documents', icon: FileScan },
  { label: 'Страховые продукты', href: '/products', icon: PackageSearch },
  { label: 'Платежи', href: '/payments', icon: Wallet },
]

export function getNavForRole(account: Account | null | undefined): NavItem[] {
  const role = account?.role
  if (role === 'super_admin') return superAdminNav
  if (role === 'federation_secretary') return federationSecretaryNav
  if (role === 'federation_director') return federationDirectorNav
  if (role === 'admin') {
    const sport = account?.insurance_access.find((grant) => grant.insurance_type === 'sport')
    if (!sport) return adminNav
    const sportNav: NavItem[] = [
      { label: 'Обзор', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Федерации', href: '/federations', icon: Building2 },
      { label: 'Спортсмены', href: '/athletes', icon: Users },
      { label: 'Страховые продукты', href: '/products', icon: PackageSearch },
      { label: 'Заявки', href: '/applications', icon: Inbox },
      { label: 'Полисы', href: '/policies', icon: FileText },
      { label: 'Документы', href: '/documents', icon: FileScan },
      { label: 'Платежи', href: '/payments', icon: Wallet },
    ]
    if (sport.permission === 'manage') sportNav.push({ label: 'Импорт данных', href: '/import', icon: Upload })
    return sportNav
  }
  return []
}
