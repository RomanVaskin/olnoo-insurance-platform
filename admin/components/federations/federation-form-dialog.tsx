'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  ApiError,
  createFederation,
  updateFederation,
  type FederationInput,
  type FederationRecord,
} from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

// Mirrors the error codes the backend returns for POST/PATCH /api/federations
// (see src/routes/federations.ts) so validation failures show a readable message
// instead of a raw error code.
const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Укажите название федерации.',
  invalid_slug: 'Slug должен состоять из латинских строчных букв, цифр и дефисов.',
  invalid_status: 'Недопустимый статус.',
  slug_taken: 'Федерация с таким slug уже существует.',
  no_fields_to_update: 'Нет изменений для сохранения.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось сохранить федерацию. Попробуйте ещё раз.'
}

export function FederationFormDialog({
  open,
  onOpenChange,
  federation,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present in edit mode, pre-populates the form; absent (or null) creates a new federation. */
  federation?: FederationRecord | null
  onSaved: (federation: FederationRecord) => void
}) {
  const isEdit = Boolean(federation)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [status, setStatus] = useState('active')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(federation?.name ?? '')
      setSlug(federation?.slug ?? '')
      setStatus(federation?.status ?? 'active')
      setError(null)
      setSubmitting(false)
    }
  }, [open, federation])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const input: FederationInput = { name: name.trim(), slug: slug.trim(), status }

    try {
      const saved =
        isEdit && federation ? await updateFederation(federation.id, input) : await createFederation(input)
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Редактировать федерацию' : 'Создать федерацию'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Название</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Slug</span>
          <input
            type="text"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Латинские строчные буквы, цифры и дефисы"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Статус</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="active">Активна</option>
            <option value="inactive">Неактивна</option>
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
