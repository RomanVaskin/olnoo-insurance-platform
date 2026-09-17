'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileQuestion, Inbox, Pencil, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { InsuredStatusBadge } from '@/components/athletes/insured-status-badge'
import { AthleteFormDialog } from '@/components/athletes/athlete-form-dialog'
import { StatePanel } from '@/components/applications/state-panel'
import { useAccount } from '@/lib/auth-context'
import { ApiError, fetchAthlete, fetchFederations, type AthleteDetail, type Federation } from '@/lib/api'
import { formatDateTime, formatPersonName } from '@/lib/utils'

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
  const isSuperAdmin = account?.role === 'super_admin'
  const [athlete, setAthlete] = useState<AthleteDetail | null>(null)
  const [federations, setFederations] = useState<Federation[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(() => {
    let cancelled = false

    setState('loading')

    fetchAthlete(params.id)
      .then((result) => {
        if (cancelled) return
        setAthlete(result)
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

  useEffect(() => {
    if (isSuperAdmin) {
      fetchFederations()
        .then(setFederations)
        .catch(() => setFederations([]))
    }
  }, [isSuperAdmin])

  const activePolicy = athlete?.policies.find((p) => p.status === 'active') ?? null

  return (
    <>
      <PageHeader
        title="Спортсмен"
        description={athlete ? formatPersonName(athlete.person) : undefined}
        action={
          <div className="flex gap-2">
            {isSuperAdmin && athlete ? (
              <Button variant="outline" size="lg" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Редактировать
              </Button>
            ) : null}
            <Button variant="outline" size="lg" onClick={() => router.push('/athletes')}>
              <ArrowLeft className="size-4" />
              К списку
            </Button>
          </div>
        }
      />
      {isSuperAdmin && athlete ? (
        <AthleteFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          federations={federations}
          athlete={athlete}
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
          <StatePanel icon={ShieldX} message="Доступ к этому спортсмену ограничен для вашей роли." />
        ) : state === 'not_found' ? (
          <StatePanel icon={FileQuestion} message="Спортсмен не найден." />
        ) : state === 'error' ? (
          <StatePanel
            icon={Inbox}
            message="Не удалось загрузить данные спортсмена. Попробуйте обновить страницу."
          />
        ) : athlete ? (
          <div className="space-y-4">
            <Card title="Спортсмен">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="ФИО" value={formatPersonName(athlete.person)} />
                <Field
                  label="Статус"
                  value={<InsuredStatusBadge insured={activePolicy !== null} />}
                />
                <Field
                  label="Полис"
                  value={activePolicy?.policy_number ?? '—'}
                />
                <Field label="ID" value={<span className="font-mono text-xs">{athlete.person.id}</span>} />
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="Контакты">
                <Field label="Телефон" value={athlete.person.phone ?? '—'} />
                <Field label="Email" value={athlete.person.email ?? '—'} />
                <Field label="Дата рождения" value={athlete.person.birthdate ?? '—'} />
                <Field label="Пол" value={athlete.person.gender ?? '—'} />
              </Card>

              <Card title="Федерации и клубы">
                {athlete.federation_memberships.length > 0 ? (
                  <div className="space-y-4">
                    {athlete.federation_memberships.map((m, i) => (
                      <div key={i} className="grid grid-cols-2 gap-4 border-t border-border pt-4 first:border-0 first:pt-0">
                        <Field label="Федерация" value={m.federation?.name ?? '—'} />
                        <Field label="Клуб" value={m.club ?? '—'} />
                        <Field label="Тренер" value={m.coach ?? '—'} />
                        <Field label="Разряд" value={m.grade ?? '—'} />
                        <Field label="Вес" value={m.weight !== null ? `${m.weight} кг` : '—'} />
                        <Field label="Вид спорта" value={m.sport_name ?? '—'} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Членство в федерациях не найдено</p>
                )}
              </Card>
            </div>

            <Card title="Полисы">
              {athlete.policies.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                          {['Номер', 'Продукт', 'Статус', 'Срок действия'].map((h) => (
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
                        {athlete.policies.map((p) => (
                          <tr key={p.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 font-medium whitespace-nowrap">{p.policy_number}</td>
                            <td className="px-4 py-3 text-muted-foreground">{p.product.name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{p.status}</td>
                            <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                              {formatDateTime(p.valid_from)} — {formatDateTime(p.valid_to)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Полисы отсутствуют</p>
              )}
            </Card>
          </div>
        ) : null}
      </div>
    </>
  )
}
