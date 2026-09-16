'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, FileQuestion, Inbox, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ApplicationStatusBadge } from '@/components/applications/application-status-badge'
import { PolicyStatusBadge } from '@/components/policies/policy-status-badge'
import { StatePanel } from '@/components/applications/state-panel'
import { ApiError, fetchPolicy, type PolicyDetail } from '@/lib/api'
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
  const [policy, setPolicy] = useState<PolicyDetail | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
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

  return (
    <>
      <PageHeader
        title="Полис"
        description={policy ? policy.policy_number : undefined}
        action={
          <Button variant="outline" size="lg" onClick={() => router.push('/')}>
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
                <a href={policy.policy_url} target="_blank" rel="noreferrer" className="inline-block">
                  <Button variant="outline" size="lg">
                    <Download className="size-4" />
                    Скачать полис
                  </Button>
                </a>
              ) : null}
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Застрахованный">
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

              <Card title="Заявка">
                {policy.application ? (
                  <>
                    <Field label="Статус" value={<ApplicationStatusBadge status={policy.application.status} />} />
                    <Field label="Сумма" value={formatKopecks(policy.application.amount_kopecks)} />
                    <Field label="Создана" value={formatDateTime(policy.application.created_at)} />
                    <Field label="ID" value={<span className="font-mono text-xs">{policy.application.id}</span>} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Заявка не найдена</p>
                )}
              </Card>

              <Card title="Оплата">
                {policy.payment ? (
                  <>
                    <Field label="Статус" value={policy.payment.status} />
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
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
