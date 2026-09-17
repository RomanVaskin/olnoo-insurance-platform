export type Account = {
  id: string
  person_id: string | null
  email: string | null
  role: string
  insurance_access: InsuranceAccessGrant[]
}

export type InsurancePermission = 'read' | 'manage'

export type InsuranceAccessGrant = {
  insurance_type: string
  permission: InsurancePermission
}

export const INSURANCE_TYPES = ['sport', 'travel', 'health', 'auto', 'property', 'business'] as const

export const INSURANCE_TYPE_LABELS: Record<string, string> = {
  sport: 'Спорт',
  travel: 'Путешествия',
  health: 'Здоровье',
  auto: 'Авто',
  property: 'Недвижимость',
  business: 'Бизнес',
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Супер-админ',
  admin: 'Админ',
  federation_director: 'Директор федерации',
  federation_secretary: 'Секретарь федерации',
  athlete: 'Пользователь',
  guardian: 'Опекун',
}

export function getInsuranceTypeLabel(type: string): string {
  return INSURANCE_TYPE_LABELS[type] ?? type
}

export function getAccessibleInsuranceTypes(account: Account | null): string[] {
  if (account?.role === 'super_admin') return [...INSURANCE_TYPES]
  if (account?.role !== 'admin') return []
  return account.insurance_access.map((grant) => grant.insurance_type)
}

export function getManageableInsuranceTypes(account: Account | null): string[] {
  if (account?.role === 'super_admin') return [...INSURANCE_TYPES]
  if (account?.role !== 'admin') return []
  return account.insurance_access
    .filter((grant) => grant.permission === 'manage')
    .map((grant) => grant.insurance_type)
}

export function canManageInsuranceType(account: Account | null, type: string): boolean {
  return getManageableInsuranceTypes(account).includes(type)
}

export function hasAnyInsuranceManageAccess(account: Account | null): boolean {
  return getManageableInsuranceTypes(account).length > 0
}

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}

export type LoginResult = { ok: true; account: Account } | { ok: false; status: number }

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    return { ok: false, status: res.status }
  }

  const data = (await res.json()) as { account: Account }
  return { ok: true, account: data.account }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })
}

export async function getCurrentAccount(): Promise<Account | null> {
  const res = await fetch('/api/auth/me', {
    credentials: 'include',
  })

  if (!res.ok) {
    return null
  }

  const data = (await res.json()) as { account: Account }
  return data.account
}
