'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ApiError,
  createPaymentRouting,
  deletePaymentRouting,
  type CreatePaymentRoutingInput,
  type Federation,
  type PaymentAccount,
  type PaymentRoutingRule,
  type Product,
} from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

const INSURANCE_TYPE_LABELS: Record<string, string> = {
  sport: 'Спортивное страхование',
  travel: 'Туристическое страхование',
  health: 'Страхование здоровья',
  auto: 'Автострахование',
  property: 'Страхование недвижимости',
  business: 'Страхование бизнеса',
}

const LEVEL_LABELS: Record<PaymentRoutingRule['target']['level'], string> = {
  product: 'Продукт',
  federation: 'Федерация',
  insurance_type: 'Вид страхования',
  default: 'По умолчанию',
}

type TargetKind = 'product' | 'federation' | 'insurance_type' | 'default'

const ERROR_MESSAGES: Record<string, string> = {
  payment_account_id_required: 'Выберите платёжный профиль.',
  only_one_target_allowed: 'Укажите только один уровень маршрутизации.',
  payment_account_not_found: 'Платёжный профиль не найден.',
  invalid_insurance_type: 'Недопустимый вид страхования.',
  invalid_federation_id: 'Выберите федерацию из списка.',
  federation_not_found: 'Федерация не найдена.',
  invalid_product_id: 'Выберите продукт из списка.',
  product_not_found: 'Продукт не найден.',
  routing_rule_already_exists_for_target: 'Правило для этой цели уже существует.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось сохранить правило. Попробуйте ещё раз.'
}

function targetLabel(rule: PaymentRoutingRule): string {
  if (rule.target.level === 'product') return rule.target.product.name
  if (rule.target.level === 'federation') return rule.target.federation.name
  if (rule.target.level === 'insurance_type') return INSURANCE_TYPE_LABELS[rule.target.insurance_type] ?? rule.target.insurance_type
  return 'Единое правило для всей платформы'
}

export function PaymentRoutingPanel({
  rules,
  paymentAccounts,
  federations,
  products,
  onChanged,
}: {
  rules: PaymentRoutingRule[]
  paymentAccounts: PaymentAccount[]
  federations: Federation[]
  products: Product[]
  onChanged: () => void
}) {
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [targetKind, setTargetKind] = useState<TargetKind>('insurance_type')
  const [insuranceType, setInsuranceType] = useState('sport')
  const [federationId, setFederationId] = useState('')
  const [productId, setProductId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!paymentAccountId) {
      setError(ERROR_MESSAGES.payment_account_id_required)
      return
    }
    setSubmitting(true)
    setError(null)

    const input: CreatePaymentRoutingInput = { payment_account_id: paymentAccountId }
    if (targetKind === 'insurance_type') input.insurance_type = insuranceType
    else if (targetKind === 'federation') input.federation_id = federationId
    else if (targetKind === 'product') input.product_id = productId

    try {
      await createPaymentRouting(input)
      setPaymentAccountId('')
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await deletePaymentRouting(id)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <h2 className="text-sm font-semibold tracking-tight">Маршрутизация платежей</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Приоритет: продукт → федерация → вид страхования → правило по умолчанию.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              {['Приоритет', 'Цель', 'Профиль', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Правил пока нет — используется env-переменная YooKassa по умолчанию.
                </td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{LEVEL_LABELS[rule.target.level]}</td>
                  <td className="px-3 py-2 font-medium">{targetLabel(rule)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{rule.payment_account.name}</td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" size="icon-sm" disabled={busyId === rule.id} onClick={() => handleDelete(rule.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Профиль</span>
            <select value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)} className={inputClass}>
              <option value="">Выберите профиль</option>
              {paymentAccounts.map((pa) => (
                <option key={pa.id} value={pa.id}>
                  {pa.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Уровень</span>
            <select value={targetKind} onChange={(e) => setTargetKind(e.target.value as TargetKind)} className={inputClass}>
              <option value="product">Продукт</option>
              <option value="federation">Федерация</option>
              <option value="insurance_type">Вид страхования</option>
              <option value="default">По умолчанию (для всей платформы)</option>
            </select>
          </label>
        </div>

        {targetKind === 'insurance_type' ? (
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Вид страхования</span>
            <select value={insuranceType} onChange={(e) => setInsuranceType(e.target.value)} className={inputClass}>
              {Object.entries(INSURANCE_TYPE_LABELS).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {targetKind === 'federation' ? (
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Федерация</span>
            <select required value={federationId} onChange={(e) => setFederationId(e.target.value)} className={inputClass}>
              <option value="">Выберите федерацию</option>
              {federations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {targetKind === 'product' ? (
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Продукт</span>
            <select required value={productId} onChange={(e) => setProductId(e.target.value)} className={inputClass}>
              <option value="">Выберите продукт</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button onClick={handleCreate} disabled={submitting}>
          {submitting ? 'Сохранение…' : 'Добавить правило'}
        </Button>
      </div>
    </div>
  )
}
