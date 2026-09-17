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
  type InsuranceAccessGrant,
  type PlatformUser,
} from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

// This subsystem only ever manages these four roles — athlete/guardian accounts
// belong to Athletes CRUD and are never created or edited here.
const MANAGED_ROLES = ['super_admin', 'admin', 'federation_secretary', 'federation_director'] as const

// Mirrors insurance_products.category / admin_insurance_access.insurance_type.
const INSURANCE_TYPE_LABELS: Record<string, string> = {
  sport: 'Спортивное страхование',
  travel: 'Туристическое страхование',
  health: 'Страхование здоровья',
  auto: 'Автострахование',
  property: 'Страхование недвижимости',
  business: 'Страхование бизнеса',
}
const PERMISSION_LABELS: Record<string, string> = { read: 'Просмотр', manage: 'Управление' }

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
  insurance_access_required: 'Добавьте хотя бы один вид страхования.',
  invalid_insurance_type: 'Недопустимый вид страхования.',
  invalid_permission: 'Недопустимое право доступа.',
  duplicate_insurance_type: 'Этот вид страхования уже добавлен.',
  insurance_access_not_allowed_for_role: 'Доступ к видам страхования указывается только для роли «Админ».',
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
  const [insuranceAccess, setInsuranceAccess] = useState<Record<string, InsuranceAccessGrant['permission'] | null>>({})
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
      setInsuranceAccess({})
      setError(null)
      setSubmitting(false)
    }
  }, [open, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!isEdit && role === 'admin' && Object.values(insuranceAccess).every((p) => p === null)) {
      setError(ERROR_MESSAGES.insurance_access_required)
      return
    }

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
        if (role === 'admin') {
          input.insurance_access = Object.entries(insuranceAccess)
            .filter((entry): entry is [string, InsuranceAccessGrant['permission']] => entry[1] !== null)
            .map(([insurance_type, permission]) => ({ insurance_type, permission }))
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

        {role === 'admin' && !isEdit ? (
          <div className="block">
            <span className="mb-2 block text-sm font-medium">Доступ к видам страхования</span>
            <div className="space-y-2 rounded-lg border border-border p-3">
              {Object.entries(INSURANCE_TYPE_LABELS).map(([type, label]) => {
                const permission = insuranceAccess[type] ?? null
                return (
                  <div key={type} className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={permission !== null}
                        onChange={(e) =>
                          setInsuranceAccess((prev) => ({ ...prev, [type]: e.target.checked ? 'read' : null }))
                        }
                        className="size-4 rounded border-border"
                      />
                      {label}
                    </label>
                    <select
                      disabled={permission === null}
                      value={permission ?? 'read'}
                      onChange={(e) =>
                        setInsuranceAccess((prev) => ({
                          ...prev,
                          [type]: e.target.value as InsuranceAccessGrant['permission'],
                        }))
                      }
                      className={`${inputClass} w-40`}
                    >
                      <option value="read">{PERMISSION_LABELS.read}</option>
                      <option value="manage">{PERMISSION_LABELS.manage}</option>
                    </select>
                  </div>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Отметьте хотя бы один вид страхования.</p>
          </div>
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
