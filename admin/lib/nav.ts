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

// 'admin' is scoped by insurance type (enforced server-side), not by federation — it has
// no access to Athletes/Federations/Documents/Users/Import/Settings at all (see
// src/routes/*.ts guards), so those never appear here regardless of which types it holds.
const adminNav: NavItem[] = [
  { label: 'Обзор', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Заявки', href: '/applications', icon: Inbox },
  { label: 'Полисы', href: '/policies', icon: FileText },
  { label: 'Страховые продукты', href: '/products', icon: PackageSearch },
  { label: 'Платежи', href: '/payments', icon: Wallet },
]

export function getNavForRole(role: string | null | undefined): NavItem[] {
  if (role === 'federation_secretary') return federationSecretaryNav
  if (role === 'federation_director') return federationDirectorNav
  if (role === 'admin') return adminNav
  return superAdminNav
}
