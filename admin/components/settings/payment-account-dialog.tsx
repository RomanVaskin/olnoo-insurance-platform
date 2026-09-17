'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  ApiError,
  createPaymentAccount,
  updatePaymentAccount,
  type CreatePaymentAccountInput,
  type PaymentAccount,
} from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

// Mirrors the error codes the backend returns for POST/PATCH /api/settings/payment-accounts.
const ERROR_MESSAGES: Record<string, string> = {
  invalid_provider: 'Недопустимый провайдер.',
  name_required: 'Укажите название профиля.',
  shop_id_required: 'Укажите Shop ID.',
  invalid_status: 'Недопустимый статус.',
  invalid_secret_key: 'Некорректный секретный ключ.',
  secrets_encryption_not_configured:
    'Шифрование секретов не настроено на сервере (PAYMENT_SECRETS_ENCRYPTION_KEY). Обратитесь к разработчику.',
  no_fields_to_update: 'Нет изменений для сохранения.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось сохранить профиль. Попробуйте ещё раз.'
}

export function PaymentAccountDialog({
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present in edit mode, pre-populates the form; absent (or null) creates a new profile. */
  account?: PaymentAccount | null
  onSaved: (account: PaymentAccount) => void
}) {
  const isEdit = Boolean(account)
  const [name, setName] = useState('')
  const [shopId, setShopId] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [status, setStatus] = useState('active')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(account?.name ?? '')
      setShopId('')
      setSecretKey('')
      setStatus(account?.status ?? 'active')
      setError(null)
      setSubmitting(false)
    }
  }, [open, account])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      if (isEdit && account) {
        const saved = await updatePaymentAccount(account.id, {
          name: name.trim(),
          status,
          ...(shopId.trim() !== '' ? { shop_id: shopId.trim() } : {}),
          ...(secretKey.trim() !== '' ? { secret_key: secretKey.trim() } : {}),
        })
        onSaved(saved)
      } else {
        const input: CreatePaymentAccountInput = {
          provider: 'yookassa',
          name: name.trim(),
          shop_id: shopId.trim(),
          status,
        }
        if (secretKey.trim() !== '') {
          input.secret_key = secretKey.trim()
        }
        const saved = await createPaymentAccount(input)
        onSaved(saved)
      }
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={isEdit ? 'Редактировать профиль' : 'Создать платёжный профиль'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Название</span>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Провайдер</span>
          <input type="text" disabled value="YooKassa" className={inputClass} />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Shop ID</span>
          <input
            type="text"
            required={!isEdit}
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            className={inputClass}
            placeholder={isEdit ? `Текущий: ${account?.shop_id_masked}` : ''}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Секретный ключ</span>
          <input
            type="password"
            autoComplete="new-password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            className={inputClass}
            placeholder={isEdit ? (account?.secret_configured ? 'Оставьте пустым, чтобы не менять' : 'Не задан') : 'Необязательно сейчас'}
          />
          <p className="mt-1 text-xs text-muted-foreground">Ключ хранится в зашифрованном виде и не показывается повторно.</p>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Статус</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="active">Активен</option>
            <option value="inactive">Неактивен</option>
          </select>
        </label>

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
