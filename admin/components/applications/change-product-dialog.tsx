'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ApiError, fetchProducts, updateApplicationProduct, type ApplicationDetail, type Product } from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

// Mirrors the error codes the backend returns for PATCH /api/applications/:id
// (see src/routes/applications.ts).
const ERROR_MESSAGES: Record<string, string> = {
  product_id_required: 'Выберите продукт.',
  application_not_editable: 'Заявку больше нельзя редактировать (уже оплачена или обработана).',
  product_change_requires_federation: 'У заявки нет федерации — смена продукта недоступна.',
  product_not_found: 'Продукт не найден.',
  product_not_available_for_federation: 'Этот продукт не назначен федерации заявки (или неактивен).',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось изменить продукт. Попробуйте ещё раз.'
}

export function ChangeProductDialog({
  open,
  onOpenChange,
  application,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  application: ApplicationDetail
  onSaved: (application: ApplicationDetail) => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [productId, setProductId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setProductId(application.product.id)
      setError(null)
      setSubmitting(false)
      fetchProducts()
        .then(setProducts)
        .catch(() => setProducts([]))
    }
  }, [open, application])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const saved = await updateApplicationProduct(application.id, productId)
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Изменить продукт">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Сумма заявки будет пересчитана по действующей цене федерации для нового продукта.
        </p>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Продукт</span>
          <select required value={productId} onChange={(e) => setProductId(e.target.value)} className={inputClass}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" size="lg" disabled={submitting || productId === application.product.id}>
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
