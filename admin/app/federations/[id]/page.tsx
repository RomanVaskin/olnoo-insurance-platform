'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileQuestion, Inbox, Pencil, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { FederationStatusBadge } from '@/components/federations/federation-status-badge'
import { FederationFormDialog } from '@/components/federations/federation-form-dialog'
import { InsuredStatusBadge } from '@/components/athletes/insured-status-badge'
import { StatePanel } from '@/components/applications/state-panel'
import { useAccount } from '@/lib/auth-context'
import { ApiError, fetchFederation, type FederationDetail } from '@/lib/api'
import { formatKopecks, formatPersonName } from '@/lib/utils'

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
  const account = useAccount()
  const [federation, setFederation] = useState<FederationDetail | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(() => {
    let cancelled = false

    setState('loading')

    fetchFederation(params.id)
      .then((result) => {
        if (cancelled) return
        setFederation(result)
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

  const showFinance = federation ? federation.paid_amount_kopecks !== undefined : false

  return (
    <>
      <PageHeader
        title="Федерация"
        description={federation ? federation.federation.name : undefined}
        action={
          <div className="flex gap-2">
            {account?.role === 'super_admin' && federation ? (
              <Button variant="outline" size="lg" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Редактировать
              </Button>
            ) : null}
            <Button variant="outline" size="lg" onClick={() => router.push('/federations')}>
              <ArrowLeft className="size-4" />
              К списку
            </Button>
          </div>
        }
      />
      {account?.role === 'super_admin' && federation ? (
        <FederationFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          federation={federation.federation}
          onSaved={() => load()}
        />
      ) : null}
      <div className="px-6 py-8 lg:px-10">
        {state === 'loading' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-muted/30" />
            ))}
          </div>
        ) : state === 'forbidden' ? (
          <StatePanel icon={ShieldX} message="Доступ к этой федерации ограничен для вашей роли." />
        ) : state === 'not_found' ? (
          <StatePanel icon={FileQuestion} message="Федерация не найдена." />
        ) : state === 'error' ? (
          <StatePanel
            icon={Inbox}
            message="Не удалось загрузить данные федерации. Попробуйте обновить страницу."
          />
        ) : federation ? (
          <div className="space-y-4">
            <Card title="Федерация">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Название" value={federation.federation.name} />
                <Field label="Slug" value={<span className="font-mono text-xs">{federation.federation.slug}</span>} />
                <Field label="Статус" value={<FederationStatusBadge status={federation.federation.status} />} />
                <Field label="ID" value={<span className="font-mono text-xs">{federation.federation.id}</span>} />
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Показатели">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Спортсменов" value={federation.athlete_count} />
                  {showFinance ? (
                    <>
                      <Field label="Заявок" value={federation.application_count} />
                      <Field label="Полисов" value={federation.policy_count} />
                      <Field
                        label="Оплачено"
                        value={
                          federation.paid_amount_kopecks !== undefined
                            ? formatKopecks(federation.paid_amount_kopecks)
                            : '—'
                        }
                      />
                    </>
                  ) : null}
                </div>
              </Card>

              <Card title="Назначенные пользователи">
                {federation.assigned_users.length > 0 ? (
                  <div className="space-y-3">
                    {federation.assigned_users.map((u) => (
                      <div key={u.id} className="flex items-center justify-between border-t border-border pt-3 first:border-0 first:pt-0">
                        <span className="text-sm">{u.email ?? '—'}</span>
                        <span className="text-xs text-muted-foreground">
                          {u.role === 'director' ? 'Директор' : u.role === 'secretary' ? 'Секретарь' : u.role}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Пользователи не назначены</p>
                )}
              </Card>
            </div>

            <Card title="Назначенные продукты">
              {federation.assigned_products.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                          {['Продукт', 'Категория', 'Цена', 'Активен'].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {federation.assigned_products.map((p) => (
                          <tr key={p.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 font-medium whitespace-nowrap">{p.product.name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{p.product.category}</td>
                            <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                              {formatKopecks(p.price_kopecks)}
                            </td>
                            <td className="px-4 py-3">
                              {p.active ? (
                                <span className="inline-flex items-center rounded-full bg-foreground px-2.5 py-0.5 text-xs font-medium text-background">
                                  Да
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                  Нет
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Продукты не назначены</p>
              )}
            </Card>

            <Card title="Спортсмены">
              {federation.athletes.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                          {['ФИО', 'Клуб', 'Тренер', 'Разряд', 'Статус', 'Полис'].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {federation.athletes.map((a) => (
                          <tr
                            key={a.id}
                            onClick={() => router.push(`/athletes/${a.id}`)}
                            className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                          >
                            <td className="px-4 py-3 font-medium whitespace-nowrap">{formatPersonName(a)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{a.club ?? '—'}</td>
                            <td className="px-4 py-3 text-muted-foreground">{a.coach ?? '—'}</td>
                            <td className="px-4 py-3 text-muted-foreground">{a.grade ?? '—'}</td>
                            <td className="px-4 py-3">
                              <InsuredStatusBadge insured={a.insured} />
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                              {a.active_policy_number ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Спортсменов пока нет</p>
              )}
            </Card>
          </div>
        ) : null}
      </div>
    </>
  )
}
