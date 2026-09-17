'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ApiError, createProduct, updateProduct, type Product, type ProductInput } from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const CATEGORY_LABELS: Record<string, string> = {
  sport: 'Спорт',
  travel: 'Путешествия',
  health: 'Здоровье',
  auto: 'Авто',
  property: 'Недвижимость',
  business: 'Бизнес',
}

// Mirrors the error codes the backend returns for POST/PATCH /api/products
// (see src/routes/products.ts).
const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Укажите название продукта.',
  invalid_category: 'Выберите категорию продукта.',
  invalid_status: 'Недопустимый статус.',
  invalid_insurer_name: 'Некорректное название страховщика.',
  invalid_coverage_amount_kopecks: 'Сумма покрытия должна быть неотрицательным числом.',
  invalid_validity_days: 'Срок действия должен быть положительным числом дней.',
  invalid_base_price_kopecks: 'Базовая цена должна быть неотрицательным числом.',
  no_fields_to_update: 'Нет изменений для сохранения.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось сохранить продукт. Попробуйте ещё раз.'
}

function rublesToKopecks(value: string): number | null {
  if (value.trim() === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.round(num * 100)
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present in edit mode, pre-populates the form; absent (or null) creates a new product. */
  product?: Product | null
  onSaved: (product: Product) => void
}) {
  const isEdit = Boolean(product)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('sport')
  const [insurerName, setInsurerName] = useState('')
  const [coverageRubles, setCoverageRubles] = useState('')
  const [validityDays, setValidityDays] = useState('365')
  const [basePriceRubles, setBasePriceRubles] = useState('')
  const [status, setStatus] = useState('active')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(product?.name ?? '')
      setCategory(product?.category ?? 'sport')
      setInsurerName(product?.insurer_name ?? '')
      setCoverageRubles(
        product?.coverage_amount_kopecks !== null && product?.coverage_amount_kopecks !== undefined
          ? String(product.coverage_amount_kopecks / 100)
          : '',
      )
      setValidityDays(product ? String(product.validity_days) : '365')
      setBasePriceRubles(product ? String(product.base_price_kopecks / 100) : '')
      setStatus(product?.status ?? 'active')
      setError(null)
      setSubmitting(false)
    }
  }, [open, product])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const validityNum = Number(validityDays)
    const basePriceKopecks = rublesToKopecks(basePriceRubles)

    if (!Number.isInteger(validityNum) || validityNum <= 0 || basePriceKopecks === null) {
      setError('Проверьте срок действия и базовую цену.')
      setSubmitting(false)
      return
    }

    const input: ProductInput = {
      name: name.trim(),
      category,
      insurer_name: insurerName.trim() === '' ? null : insurerName.trim(),
      coverage_amount_kopecks: rublesToKopecks(coverageRubles),
      validity_days: validityNum,
      base_price_kopecks: basePriceKopecks,
      status,
    }

    try {
      const saved = isEdit && product ? await updateProduct(product.id, input) : await createProduct(input)
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={isEdit ? 'Редактировать продукт' : 'Создать продукт'}>
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
          <span className="mb-2 block text-sm font-medium">Категория</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Страховщик</span>
          <input
            type="text"
            value={insurerName}
            onChange={(e) => setInsurerName(e.target.value)}
            className={inputClass}
            placeholder="Необязательно"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Покрытие, ₽</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={coverageRubles}
              onChange={(e) => setCoverageRubles(e.target.value)}
              className={inputClass}
              placeholder="Необязательно"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Срок действия, дн.</span>
            <input
              type="number"
              min="1"
              step="1"
              required
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Базовая цена, ₽</span>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={basePriceRubles}
              onChange={(e) => setBasePriceRubles(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Статус</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
            </select>
          </label>
        </div>

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
