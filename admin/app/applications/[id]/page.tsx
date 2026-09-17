'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileQuestion, Inbox, Pencil, RotateCcw, ShieldX, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ApplicationStatusBadge } from '@/components/applications/application-status-badge'
import { ChangeProductDialog } from '@/components/applications/change-product-dialog'
import { StatePanel } from '@/components/applications/state-panel'
import { useAccount } from '@/lib/auth-context'
import { canManageInsuranceType, getManageableInsuranceTypes } from '@/lib/auth'
import { ApiError, cancelApplication, fetchApplication, reopenApplication, type ApplicationDetail } from '@/lib/api'
import { formatDateTime, formatKopecks, formatPaymentStatus, formatPersonName } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'not_found' | 'error'

// Mirrors src/routes/applications.ts's EDITABLE_STATUSES — product change/cancel are only
// offered while the application is still before payment.
const EDITABLE_STATUSES = ['draft', 'pending_payment']

// Mirrors the error codes POST /api/applications/:id/{cancel,reopen} can return.
const ACTION_ERROR_MESSAGES: Record<string, string> = {
  invalid_transition: 'Это действие недоступно для текущего статуса заявки.',
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
  const [application, setApplication] = useState<ApplicationDetail | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [editOpen, setEditOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<'cancel' | 'reopen' | null>(null)

  const load = useCallback(() => {
    let cancelled = false

    setState('loading')

    fetchApplication(params.id)
      .then((result) => {
        if (cancelled) return
        setApplication(result)
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
  const canManage = Boolean(
    application && account && (
      isFederationStaff || canManageInsuranceType(account, application.product.category)
    ),
  )
  const isEditable = application ? EDITABLE_STATUSES.includes(application.status) : false

  async function handleCancel() {
    if (!application) return
    setActionBusy('cancel')
    setActionError(null)
    try {
      const updated = await cancelApplication(application.id)
      setApplication(updated)
    } catch (err) {
      setActionError(actionErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  async function handleReopen() {
    if (!application) return
    setActionBusy('reopen')
    setActionError(null)
    try {
      const updated = await reopenApplication(application.id)
      setApplication(updated)
    } catch (err) {
      setActionError(actionErrorMessage(err))
    } finally {
      setActionBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Заявка"
        description={application ? formatPersonName(application.person) : undefined}
        action={
          <div className="flex flex-wrap gap-2">
            {canManage && application && isEditable ? (
              <>
                <Button variant="outline" size="lg" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  Редактировать
                </Button>
                <Button variant="outline" size="lg" disabled={actionBusy !== null} onClick={handleCancel}>
                  <XCircle className="size-4" />
                  Отменить
                </Button>
              </>
            ) : null}
            {canManage && application && application.status === 'cancelled' ? (
              <Button variant="outline" size="lg" disabled={actionBusy !== null} onClick={handleReopen}>
                <RotateCcw className="size-4" />
                Возобновить
              </Button>
            ) : null}
            <Button variant="outline" size="lg" onClick={() => router.push('/applications')}>
              <ArrowLeft className="size-4" />
              К списку
            </Button>
          </div>
        }
      />
      {application ? (
        <ChangeProductDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          application={application}
          allowedCategories={account?.role === 'admin' ? getManageableInsuranceTypes(account) : undefined}
          onSaved={(updated) => setApplication(updated)}
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
          <StatePanel icon={ShieldX} message="Доступ к этой заявке ограничен для вашей роли." />
        ) : state === 'not_found' ? (
          <StatePanel icon={FileQuestion} message="Заявка не найдена." />
        ) : state === 'error' ? (
          <StatePanel
            icon={Inbox}
            message="Не удалось загрузить заявку. Попробуйте обновить страницу."
          />
        ) : application ? (
          <div className="space-y-4">
            <Card title="Заявка">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Статус" value={<ApplicationStatusBadge status={application.status} />} />
                <Field
                  label="Сумма"
                  value={application.amount_kopecks !== null ? formatKopecks(application.amount_kopecks) : '—'}
                />
                <Field label="Создана" value={formatDateTime(application.created_at)} />
                <Field label="ID" value={<span className="font-mono text-xs">{application.id}</span>} />
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card
                title="Заявитель"
                action={
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/athletes/${application.person.id}`)}>
                    Открыть спортсмена
                  </Button>
                }
              >
                <Field label="ФИО" value={formatPersonName(application.person)} />
                <Field label="ID" value={<span className="font-mono text-xs">{application.person.id}</span>} />
              </Card>

              <Card title="Федерация">
                {application.federation ? (
                  <>
                    <Field label="Название" value={application.federation.name} />
                    <Field
                      label="ID"
                      value={<span className="font-mono text-xs">{application.federation.id}</span>}
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Федерация не указана</p>
                )}
              </Card>

              <Card title="Продукт">
                <Field label="Название" value={application.product.name} />
                <Field label="ID" value={<span className="font-mono text-xs">{application.product.id}</span>} />
              </Card>

              <Card
                title="Оплата"
                action={
                  application.payment ? (
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/payments/${application.payment!.id}`)}>
                      Открыть платёж
                    </Button>
                  ) : undefined
                }
              >
                {application.payment ? (
                  <>
                    <Field label="Статус" value={formatPaymentStatus(application.payment.status)} />
                    <Field label="Сумма" value={formatKopecks(application.payment.amount_kopecks)} />
                    <Field label="Провайдер" value={application.payment.provider} />
                    <Field
                      label="Оплачена"
                      value={application.payment.paid_at ? formatDateTime(application.payment.paid_at) : '—'}
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Платёж отсутствует</p>
                )}
              </Card>

              <Card
                title="Полис"
                action={
                  application.policy ? (
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/policies/${application.policy!.id}`)}>
                      Открыть полис
                    </Button>
                  ) : undefined
                }
              >
                {application.policy ? (
                  <>
                    <Field label="Номер" value={application.policy.policy_number} />
                    <Field label="Статус" value={application.policy.status} />
                    <Field
                      label="Срок действия"
                      value={`${formatDateTime(application.policy.valid_from)} — ${formatDateTime(
                        application.policy.valid_to,
                      )}`}
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Полис ещё не выпущен</p>
                )}
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
