'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ApiError, resetUserPassword, type PlatformUser } from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_password: 'Пароль должен быть не короче 8 символов.',
  unsupported_role: 'Этот аккаунт управляется в разделе «Спортсмены», а не здесь.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось сбросить пароль. Попробуйте ещё раз.'
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  user,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: PlatformUser | null
  onDone: () => void
}) {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (open) {
      setPassword('')
      setError(null)
      setSuccess(false)
      setSubmitting(false)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSubmitting(true)
    setError(null)

    try {
      await resetUserPassword(user.id, password)
      setSuccess(true)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Сбросить пароль">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {user?.email ?? user?.id}
        </p>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Новый пароль</span>
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

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {success ? <p className="text-sm text-foreground">Пароль обновлён.</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            {success ? 'Закрыть' : 'Отмена'}
          </Button>
          {!success ? (
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? 'Сохранение…' : 'Сбросить пароль'}
            </Button>
          ) : null}
        </div>
      </form>
    </Dialog>
  )
}
