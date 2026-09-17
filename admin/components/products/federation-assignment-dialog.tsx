'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  ApiError,
  assignProductToFederation,
  updateProductFederationAssignment,
  type Federation,
  type ProductFederationAssignment,
} from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

// Mirrors the error codes the backend returns for the federation-assignment endpoints
// (see src/routes/products.ts).
const ERROR_MESSAGES: Record<string, string> = {
  federation_id_required: 'Выберите федерацию.',
  federation_not_found: 'Федерация не найдена.',
  invalid_price_kopecks: 'Цена должна быть неотрицательным числом.',
  invalid_active: 'Некорректное значение статуса активности.',
  no_fields_to_update: 'Нет изменений для сохранения.',
  federation_already_has_active_product:
    'У этой федерации уже есть активный продукт. Сначала снимите текущий активный продукт.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось сохранить назначение. Попробуйте ещё раз.'
}

export function FederationAssignmentDialog({
  open,
  onOpenChange,
  productId,
  federations,
  assignment,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: string
  /** Federations available to pick from in create mode. */
  federations: Federation[]
  /** Present in edit mode (federation is fixed); absent creates a new assignment. */
  assignment?: ProductFederationAssignment | null
  onSaved: (assignment: ProductFederationAssignment) => void
}) {
  const isEdit = Boolean(assignment)
  const [federationId, setFederationId] = useState('')
  const [priceRubles, setPriceRubles] = useState('')
  const [active, setActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setFederationId(assignment ? assignment.federation.id : (federations[0]?.id ?? ''))
      setPriceRubles(assignment ? String(assignment.price_kopecks / 100) : '')
      setActive(assignment ? assignment.active : true)
      setError(null)
      setSubmitting(false)
    }
  }, [open, assignment, federations])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const priceNum = Number(priceRubles)
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError('Укажите корректную цену.')
      setSubmitting(false)
      return
    }
    const priceKopecks = Math.round(priceNum * 100)

    try {
      const saved =
        isEdit && assignment
          ? await updateProductFederationAssignment(productId, assignment.federation.id, {
              price_kopecks: priceKopecks,
              active,
            })
          : await assignProductToFederation(productId, { federation_id: federationId, price_kopecks: priceKopecks, active })
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
      title={isEdit ? 'Изменить назначение' : 'Назначить федерации'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Федерация</span>
          {isEdit ? (
            <input type="text" disabled value={assignment?.federation.name ?? ''} className={inputClass} />
          ) : (
            <select
              required
              value={federationId}
              onChange={(e) => setFederationId(e.target.value)}
              className={inputClass}
            >
              {federations.length === 0 ? <option value="">Нет доступных федераций</option> : null}
              {federations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Цена для федерации, ₽</span>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={priceRubles}
            onChange={(e) => setPriceRubles(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-4 rounded border-border"
          />
          <span className="text-sm font-medium">Активно</span>
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" size="lg" disabled={submitting || (!isEdit && federations.length === 0)}>
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
