'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, FileQuestion, Inbox, Pencil, RefreshCw, RotateCcw, ShieldX, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ApplicationStatusBadge } from '@/components/applications/application-status-badge'
import { PolicyStatusBadge } from '@/components/policies/policy-status-badge'
import { EditPolicyNumberDialog } from '@/components/policies/edit-policy-number-dialog'
import { StatePanel } from '@/components/applications/state-panel'
import { useAccount } from '@/lib/auth-context'
import { canManageInsuranceType } from '@/lib/auth'
import {
  ApiError,
  cancelPolicy,
  expirePolicy,
  fetchPolicy,
  generatePolicyPdf,
  reactivatePolicy,
  type PolicyDetail,
} from '@/lib/api'
import { formatDateTime, formatKopecks, formatPaymentStatus, formatPersonName } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'not_found' | 'error'

// The backend enforces the real rule per role (admin needs 'manage' on the category,
// federation staff must own the policy's federation); this only decides whether to show
// the buttons at all — athletes never get a management UI here.
// Mirrors the error codes POST /api/policies/:id/{cancel,reactivate,expire,generate-pdf} return.
const ACTION_ERROR_MESSAGES: Record<string, string> = {
  invalid_transition: 'Это действие недоступно для текущего статуса или срока действия полиса.',
  unsupported_insurer: 'Нет шаблона PDF для страховщика этого продукта.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function actionErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ACTION_ERROR_MESSAGES[err.message]) {
    return ACTION_ERROR_MESSAGES[err.message]
  }
  return 'Не удалось выполнить действие. Попробуйте ещё раз.'
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  )
}

function Card({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  )
}

export default function Page() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const account = useAccount()
  const [policy, setPolicy] = useState<PolicyDetail | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [editOpen, setEditOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<'cancel' | 'reactivate' | 'expire' | 'pdf' | null>(null)

  const load = useCallback(() => {
    let cancelled = false

    setState('loading')

    fetchPolicy(params.id)
      .then((result) => {
        if (cancelled) return
        setPolicy(result)
        setState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login')
          return
        }
        if (err instanceof ApiError && err.status === 403) {
          setState('forbidden')
          return
        }
        if (err instanceof ApiError && err.status === 404) {
          setState('not_found')
          return
        }
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [params.id, router])

  useEffect(() => {
    return load()
  }, [load])

  const isFederationStaff = account?.role === 'federation_secretary' || account?.role === 'federation_director'
  const canManage = state === 'ready' && Boolean(
    policy && account && (isFederationStaff || canManageInsuranceType(account, policy.product.category)),
  )

  async function runAction(kind: 'cancel' | 'reactivate' | 'expire' | 'pdf', fn: () => Promise<PolicyDetail | { policy_url: string }>) {
    if (!policy || actionBusy) return
    setActionBusy(kind)
    setActionError(null)
    try {
      const result = await fn()
      if ('policy_number' in result) {
        setPolicy(result)
      } else {
        // generate-pdf's response doesn't carry the full detail — refetch it.
        setPolicy(await fetchPolicy(policy.id))
      }
    } catch (err) {
      setActionError(actionErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Полис"
        description={policy ? policy.policy_number : undefined}
        action={
          <div className="flex flex-wrap gap-2">
            {canManage && policy ? (
              <Button
                variant="outline"
                size="lg"
                disabled={actionBusy !== null}
                onClick={() => runAction('pdf', () => generatePolicyPdf(policy.id))}
              >
                <RefreshCw className="size-4" />
                {policy.policy_url ? 'Перегенерировать PDF' : 'Создать PDF'}
              </Button>
            ) : null}
            {canManage && policy && policy.status === 'active' ? (
              <>
                {!policy.policy_url && policy.application && ['draft', 'pending_payment'].includes(policy.application.status) ? (
                <Button variant="outline" size="lg" disabled={actionBusy !== null} onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  Изменить номер
                </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="lg"
                  disabled={actionBusy !== null}
                  onClick={() => runAction('cancel', () => cancelPolicy(policy.id))}
                >
                  <XCircle className="size-4" />
                  Отменить
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  disabled={actionBusy !== null}
                  onClick={() => runAction('expire', () => expirePolicy(policy.id))}
                >
                  Отметить истёкшим
                </Button>
              </>
            ) : null}
            {canManage && policy && policy.status === 'cancelled' ? (
              <Button
                variant="outline"
                size="lg"
                disabled={actionBusy !== null}
                onClick={() => runAction('reactivate', () => reactivatePolicy(policy.id))}
              >
                <RotateCcw className="size-4" />
                Восстановить
              </Button>
            ) : null}
            <Button variant="outline" size="lg" onClick={() => router.push('/policies')}>
              <ArrowLeft className="size-4" />
              К списку
            </Button>
          </div>
        }
      />
      {policy ? (
        <EditPolicyNumberDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          policy={policy}
          onSaved={(updated) => setPolicy(updated)}
        />
      ) : null}
      <div className="px-6 py-8 lg:px-10">
        {actionError ? <p className="mb-4 text-sm text-destructive">{actionError}</p> : null}
        {state === 'loading' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-muted/30" />
            ))}
          </div>
        ) : state === 'forbidden' ? (
          <StatePanel icon={ShieldX} message="Доступ к этому полису ограничен для вашей роли." />
        ) : state === 'not_found' ? (
          <StatePanel icon={FileQuestion} message="Полис не найден." />
        ) : state === 'error' ? (
          <StatePanel icon={Inbox} message="Не удалось загрузить полис. Попробуйте обновить страницу." />
        ) : policy ? (
          <div className="space-y-4">
            <Card title="Полис">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Номер" value={<span className="font-mono">{policy.policy_number}</span>} />
                <Field label="Статус" value={<PolicyStatusBadge status={policy.status} />} />
                <Field
                  label="Срок действия"
                  value={`${formatDateTime(policy.valid_from)} — ${formatDateTime(policy.valid_to)}`}
                />
                <Field label="ID" value={<span className="font-mono text-xs">{policy.id}</span>} />
              </div>
              {policy.policy_url ? (
                <a href={`/api/policies/${policy.id}/pdf`} target="_blank" rel="noreferrer" className="inline-block">
                  <Button variant="outline" size="lg">
                    <Download className="size-4" />
                    Скачать полис
                  </Button>
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">PDF ещё не сформирован.</p>
              )}
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card
                title="Застрахованный"
                action={
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/athletes/${policy.person.id}`)}>
                    Открыть спортсмена
                  </Button>
                }
              >
                <Field label="ФИО" value={formatPersonName(policy.person)} />
                <Field label="ID" value={<span className="font-mono text-xs">{policy.person.id}</span>} />
              </Card>

              <Card title="Федерация">
                {policy.federation ? (
                  <>
                    <Field label="Название" value={policy.federation.name} />
                    <Field label="ID" value={<span className="font-mono text-xs">{policy.federation.id}</span>} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Федерация не указана</p>
                )}
              </Card>

              <Card title="Продукт">
                <Field label="Название" value={policy.product.name} />
                <Field label="ID" value={<span className="font-mono text-xs">{policy.product.id}</span>} />
              </Card>

              <Card
                title="Заявка"
                action={
                  policy.application ? (
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/applications/${policy.application!.id}`)}>
                      Открыть заявку
                    </Button>
                  ) : undefined
                }
              >
                {policy.application ? (
                  <>
                    <Field label="Статус" value={<ApplicationStatusBadge status={policy.application.status} />} />
                    <Field label="Сумма" value={policy.application.amount_kopecks === null ? '—' : formatKopecks(policy.application.amount_kopecks)} />
                    <Field label="Создана" value={formatDateTime(policy.application.created_at)} />
                    <Field label="ID" value={<span className="font-mono text-xs">{policy.application.id}</span>} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Заявка не найдена</p>
                )}
              </Card>

              {account?.role !== 'federation_secretary' ? (<Card
                title="Оплата"
                action={
                  policy.payment ? (
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/payments/${policy.payment!.id}`)}>
                      Открыть платёж
                    </Button>
                  ) : undefined
                }
              >
                {policy.payment ? (
                  <>
                    <Field label="Статус" value={formatPaymentStatus(policy.payment.status)} />
                    <Field label="Сумма" value={formatKopecks(policy.payment.amount_kopecks)} />
                    <Field label="Провайдер" value={policy.payment.provider} />
                    <Field
                      label="Оплачена"
                      value={policy.payment.paid_at ? formatDateTime(policy.payment.paid_at) : '—'}
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Платёж отсутствует</p>
                )}
              </Card>) : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
