'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileQuestion, Inbox, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ApplicationStatusBadge } from '@/components/applications/application-status-badge'
import { StatePanel } from '@/components/applications/state-panel'
import { ApiError, fetchApplication, type ApplicationDetail } from '@/lib/api'
import { formatDateTime, formatKopecks, formatPersonName } from '@/lib/utils'

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
  const [application, setApplication] = useState<ApplicationDetail | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
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

  return (
    <>
      <PageHeader
        title="Заявка"
        description={application ? formatPersonName(application.person) : undefined}
        action={
          <Button variant="outline" size="lg" onClick={() => router.push('/applications')}>
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
                <Field label="Сумма" value={formatKopecks(application.amount_kopecks)} />
                <Field label="Создана" value={formatDateTime(application.created_at)} />
                <Field label="ID" value={<span className="font-mono text-xs">{application.id}</span>} />
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Заявитель">
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

              <Card title="Оплата">
                {application.payment ? (
                  <>
                    <Field label="Статус" value={application.payment.status} />
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

              <Card title="Полис">
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
                    {application.policy.policy_url ? (
                      <Field
                        label="Документ"
                        value={
                          <a
                            href={application.policy.policy_url}
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
