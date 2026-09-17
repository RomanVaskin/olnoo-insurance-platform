'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ApiError, updatePolicyNumber, type PolicyDetail } from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

// Mirrors the error codes the backend returns for PATCH /api/policies/:id
// (see src/routes/policies.ts).
const ERROR_MESSAGES: Record<string, string> = {
  policy_number_required: 'Укажите номер полиса.',
  policy_not_editable: 'Номер нельзя менять после оплаты, выпуска, создания PDF или окончания срока полиса.',
  policy_number_taken: 'Этот номер полиса уже используется.',
  invalid_policy_number: 'Номер должен содержать не более 200 символов без управляющих символов.',
  invalid_fields: 'Допускается изменение только номера полиса.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось изменить номер полиса. Попробуйте ещё раз.'
}

export function EditPolicyNumberDialog({
  open,
  onOpenChange,
  policy,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  policy: PolicyDetail
  onSaved: (policy: PolicyDetail) => void
}) {
  const [policyNumber, setPolicyNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPolicyNumber(policy.policy_number)
      setError(null)
      setSubmitting(false)
    }
  }, [open, policy])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const saved = await updatePolicyNumber(policy.id, policyNumber.trim())
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Изменить номер полиса">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Номер полиса</span>
          <input
            type="text"
            maxLength={200}
            disabled={submitting}
            required
            value={policyNumber}
            onChange={(e) => setPolicyNumber(e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" size="lg" disabled={submitting || policyNumber.trim() === policy.policy_number}>
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
