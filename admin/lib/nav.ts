import type { LucideIcon } from 'lucide-react'
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

export function getNavForRole(role: string | null | undefined): NavItem[] {
  if (role === 'federation_secretary') return federationSecretaryNav
  if (role === 'federation_director') return federationDirectorNav
  return superAdminNav
}
