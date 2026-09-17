'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS } from '@/lib/auth'
import {
  ApiError,
  createUser,
  updateUser,
  type CreateUserInput,
  type Federation,
  type PlatformUser,
} from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

// This subsystem only ever manages these three roles — athlete/guardian accounts
// belong to Athletes CRUD and are never created or edited here.
const MANAGED_ROLES = ['super_admin', 'federation_secretary', 'federation_director'] as const

// Mirrors the error codes the backend returns for POST/PATCH /api/users
// (see src/routes/users.ts).
const ERROR_MESSAGES: Record<string, string> = {
  invalid_role: 'Недопустимая роль.',
  invalid_email: 'Некорректный email.',
  invalid_phone: 'Некорректный телефон.',
  invalid_password: 'Пароль должен быть не короче 8 символов.',
  invalid_status: 'Недопустимый статус.',
  federation_id_required: 'Выберите федерацию для этой роли.',
  invalid_federation_id: 'Выберите федерацию из списка.',
  federation_id_not_allowed_for_role: 'Для этой роли федерация не указывается.',
  federation_not_found: 'Федерация не найдена.',
  email_taken: 'Этот email уже используется.',
  phone_taken: 'Этот телефон уже используется.',
  no_fields_to_update: 'Нет изменений для сохранения.',
  cannot_change_own_role: 'Нельзя изменить свою собственную роль.',
  unsupported_role: 'Этот аккаунт управляется в разделе «Спортсмены», а не здесь.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось сохранить пользователя. Попробуйте ещё раз.'
}

function requiresFederation(role: string): boolean {
  return role === 'federation_secretary' || role === 'federation_director'
}

export function UserFormDialog({
  open,
  onOpenChange,
  federations,
  user,
  isSelf,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  federations: Federation[]
  /** Present in edit mode, pre-populates the form; absent (or null) creates a new user. */
  user?: PlatformUser | null
  /** True when `user` is the currently logged-in super_admin — locks the role field. */
  isSelf?: boolean
  onSaved: (user: PlatformUser) => void
}) {
  const isEdit = Boolean(user)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<string>('federation_secretary')
  const [status, setStatus] = useState('active')
  const [federationId, setFederationId] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setEmail(user?.email ?? '')
      setPhone(user?.phone ?? '')
      setRole(user?.role ?? 'federation_secretary')
      setStatus(user?.status ?? 'active')
      setFederationId(user?.federation?.id ?? '')
      setPassword('')
      setError(null)
      setSubmitting(false)
    }
  }, [open, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      if (isEdit && user) {
        const input: Parameters<typeof updateUser>[1] = {
          email: email.trim(),
          phone: phone.trim() === '' ? null : phone.trim(),
          status,
        }
        if (!isSelf) {
          input.role = role
          if (requiresFederation(role)) {
            input.federation_id = federationId
          }
        }
        const saved = await updateUser(user.id, input)
        onSaved(saved)
      } else {
        const input: CreateUserInput = {
          email: email.trim(),
          phone: phone.trim() === '' ? null : phone.trim(),
          role,
          password,
        }
        if (requiresFederation(role)) {
          input.federation_id = federationId
        }
        const saved = await createUser(input)
        onSaved(saved)
      }
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={isEdit ? 'Редактировать пользователя' : 'Создать пользователя'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Телефон</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="Необязательно" />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Роль</span>
          <select
            value={role}
            disabled={isEdit && isSelf}
            onChange={(e) => setRole(e.target.value)}
            className={inputClass}
          >
            {MANAGED_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {isEdit && isSelf ? (
            <p className="mt-1 text-xs text-muted-foreground">Нельзя изменить свою собственную роль.</p>
          ) : null}
        </label>

        {requiresFederation(role) ? (
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Федерация</span>
            <select
              required
              disabled={isEdit && isSelf}
              value={federationId}
              onChange={(e) => setFederationId(e.target.value)}
              className={inputClass}
            >
              <option value="">Выберите федерацию</option>
              {federations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isEdit ? (
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Статус</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Пароль</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-muted-foreground">Не менее 8 символов.</p>
          </label>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
