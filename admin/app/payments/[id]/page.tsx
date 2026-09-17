'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileQuestion, Inbox, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ApplicationStatusBadge } from '@/components/applications/application-status-badge'
import { StatePanel } from '@/components/applications/state-panel'
import { ApiError, fetchPayment, type PaymentDetail } from '@/lib/api'
import { formatDateTime, formatKopecks, formatPaymentStatus, formatPersonName } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'not_found' | 'error'

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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  )
}

export default function Page() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [payment, setPayment] = useState<PaymentDetail | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    let cancelled = false

    setState('loading')

    fetchPayment(params.id)
      .then((result) => {
        if (cancelled) return
        setPayment(result)
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

  return (
    <>
      <PageHeader
        title="Платёж"
        description={payment ? formatPersonName(payment.person) : undefined}
        action={
          <Button variant="outline" size="lg" onClick={() => router.push('/payments')}>
            <ArrowLeft className="size-4" />
            К списку
          </Button>
        }
      />
      <div className="px-6 py-8 lg:px-10">
        {state === 'loading' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-muted/30" />
            ))}
          </div>
        ) : state === 'forbidden' ? (
          <StatePanel icon={ShieldX} message="Доступ к этому платежу ограничен для вашей роли." />
        ) : state === 'not_found' ? (
          <StatePanel icon={FileQuestion} message="Платёж не найден." />
        ) : state === 'error' ? (
          <StatePanel icon={Inbox} message="Не удалось загрузить платёж. Попробуйте обновить страницу." />
        ) : payment ? (
          <div className="space-y-4">
            <Card title="Платёж">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Статус" value={formatPaymentStatus(payment.status)} />
                <Field label="Сумма" value={formatKopecks(payment.amount_kopecks)} />
                <Field label="Провайдер" value={payment.provider} />
                <Field
                  label="ID провайдера"
                  value={<span className="font-mono text-xs">{payment.provider_payment_id}</span>}
                />
                <Field
                  label="Оплачен"
                  value={payment.paid_at ? formatDateTime(payment.paid_at) : '—'}
                />
                <Field label="Создан" value={formatDateTime(payment.created_at)} />
                <Field label="ID" value={<span className="font-mono text-xs">{payment.id}</span>} />
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Плательщик">
                <Field label="ФИО" value={formatPersonName(payment.person)} />
                <Field label="ID" value={<span className="font-mono text-xs">{payment.person.id}</span>} />
              </Card>

              <Card title="Федерация">
                {payment.federation ? (
                  <>
                    <Field label="Название" value={payment.federation.name} />
                    <Field
                      label="ID"
                      value={<span className="font-mono text-xs">{payment.federation.id}</span>}
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Федерация не указана</p>
                )}
              </Card>

              <Card title="Продукт">
                <Field label="Название" value={payment.product.name} />
                <Field label="ID" value={<span className="font-mono text-xs">{payment.product.id}</span>} />
              </Card>

              <Card title="Заявка">
                {payment.application ? (
                  <>
                    <Field label="Статус" value={<ApplicationStatusBadge status={payment.application.status} />} />
                    <Field label="Сумма" value={formatKopecks(payment.application.amount_kopecks)} />
                    <Field label="Создана" value={formatDateTime(payment.application.created_at)} />
                    <Field label="ID" value={<span className="font-mono text-xs">{payment.application.id}</span>} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Заявка не найдена</p>
                )}
              </Card>

              <Card title="Полис">
                {payment.policy ? (
                  <>
                    <Field label="Номер" value={payment.policy.policy_number} />
                    <Field label="Статус" value={payment.policy.status} />
                    <Field
                      label="Срок действия"
                      value={`${formatDateTime(payment.policy.valid_from)} — ${formatDateTime(
                        payment.policy.valid_to,
                      )}`}
                    />
                    {payment.policy.policy_url ? (
                      <Field
                        label="Документ"
                        value={
                          <a
                            href={`/api/policies/${payment.policy.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm underline underline-offset-4"
                          >
                            Открыть PDF
                          </a>
                        }
                      />
                    ) : null}
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
