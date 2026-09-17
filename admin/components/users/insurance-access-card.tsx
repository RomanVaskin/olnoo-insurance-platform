'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ApiError,
  grantUserInsuranceAccess,
  revokeUserInsuranceAccess,
  updateUserInsuranceAccess,
  type InsuranceAccessGrant,
  type PlatformUser,
} from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

// Mirrors insurance_products.category / admin_insurance_access.insurance_type.
const INSURANCE_TYPE_LABELS: Record<string, string> = {
  sport: 'Спортивное страхование',
  travel: 'Туристическое страхование',
  health: 'Страхование здоровья',
  auto: 'Автострахование',
  property: 'Страхование недвижимости',
  business: 'Страхование бизнеса',
}
const PERMISSION_LABELS: Record<InsuranceAccessGrant['permission'], string> = {
  read: 'Просмотр',
  manage: 'Управление',
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_insurance_type: 'Недопустимый вид страхования.',
  invalid_permission: 'Недопустимое право доступа.',
  cannot_change_own_insurance_access: 'Нельзя изменить собственный доступ к видам страхования.',
  unsupported_role: 'Доступ к видам страхования есть только у роли «Админ».',
  insurance_access_not_found: 'Доступ не найден.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось сохранить изменения. Попробуйте ещё раз.'
}

/**
 * "Доступ к видам страхования" — add / change permission / revoke, for a single
 * role === 'admin' user. Never rendered for the currently logged-in super_admin's
 * own account — the backend also refuses self-changes here regardless.
 */
export function InsuranceAccessCard({ user, onSaved }: { user: PlatformUser; onSaved: () => void }) {
  const [newType, setNewType] = useState('')
  const [newPermission, setNewPermission] = useState<InsuranceAccessGrant['permission']>('read')
  const [busyType, setBusyType] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assignedTypes = new Set(user.insurance_access.map((a) => a.insurance_type))
  const availableTypes = Object.keys(INSURANCE_TYPE_LABELS).filter((t) => !assignedTypes.has(t))

  async function handleAdd() {
    if (!newType) return
    setBusyType(newType)
    setError(null)
    try {
      await grantUserInsuranceAccess(user.id, { insurance_type: newType, permission: newPermission })
      setNewType('')
      setNewPermission('read')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyType(null)
    }
  }

  async function handlePermissionChange(insuranceType: string, permission: InsuranceAccessGrant['permission']) {
    setBusyType(insuranceType)
    setError(null)
    try {
      await updateUserInsuranceAccess(user.id, insuranceType, permission)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyType(null)
    }
  }

  async function handleRevoke(insuranceType: string) {
    setBusyType(insuranceType)
    setError(null)
    try {
      await revokeUserInsuranceAccess(user.id, insuranceType)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyType(null)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <h2 className="text-sm font-semibold tracking-tight">Доступ к видам страхования</h2>

      <div className="mt-4 space-y-3">
        {user.insurance_access.length === 0 ? (
          <p className="text-sm text-muted-foreground">Доступ пока не назначен.</p>
        ) : (
          user.insurance_access.map((grant) => (
            <div key={grant.insurance_type} className="flex items-center justify-between gap-3 border-t border-border pt-3 first:border-0 first:pt-0">
              <span className="text-sm">{INSURANCE_TYPE_LABELS[grant.insurance_type] ?? grant.insurance_type}</span>
              <div className="flex items-center gap-2">
                <select
                  value={grant.permission}
                  disabled={busyType === grant.insurance_type}
                  onChange={(e) => handlePermissionChange(grant.insurance_type, e.target.value as InsuranceAccessGrant['permission'])}
                  className={`${inputClass} w-40`}
                >
                  <option value="read">{PERMISSION_LABELS.read}</option>
                  <option value="manage">{PERMISSION_LABELS.manage}</option>
                </select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busyType === grant.insurance_type}
                  onClick={() => handleRevoke(grant.insurance_type)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {availableTypes.length > 0 ? (
        <div className="mt-4 flex items-end gap-2 border-t border-border pt-4">
          <label className="block flex-1">
            <span className="mb-2 block text-sm font-medium">Добавить вид страхования</span>
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className={inputClass}>
              <option value="">Выберите вид</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {INSURANCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Право</span>
            <select
              value={newPermission}
              onChange={(e) => setNewPermission(e.target.value as InsuranceAccessGrant['permission'])}
              className={`${inputClass} w-40`}
            >
              <option value="read">{PERMISSION_LABELS.read}</option>
              <option value="manage">{PERMISSION_LABELS.manage}</option>
            </select>
          </label>
          <Button onClick={handleAdd} disabled={!newType || busyType !== null}>
            Добавить
          </Button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
