export type Account = {
  id: string
  person_id: string | null
  email: string | null
  role: string
}

export const ROLE_LABELS: Record<string, string> = {
  federation_secretary: 'Секретарь федерации',
  federation_director: 'Руководитель федерации',
  super_admin: 'Администратор',
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
