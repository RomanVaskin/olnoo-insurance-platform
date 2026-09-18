'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, Plus, ShieldX, Users } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { InsuredStatusBadge } from '@/components/athletes/insured-status-badge'
import { AthleteFormDialog } from '@/components/athletes/athlete-form-dialog'
import { StatePanel } from '@/components/applications/state-panel'
import { useAccount } from '@/lib/auth-context'
import { canManageInsuranceType } from '@/lib/auth'
import { ApiError, fetchAthletes, fetchFederations, type Athlete, type Federation } from '@/lib/api'
import { formatPersonName } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

export default function Page() {
  const router = useRouter()
  const account = useAccount()
  const isSuperAdmin = account?.role === 'super_admin'
  const canManageSport = canManageInsuranceType(account, 'sport')
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [federations, setFederations] = useState<Federation[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(() => {
    setState('loading')

    return fetchAthletes()
      .then((result) => {
        setAthletes(result)
        setState('ready')
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login')
          return
        }
        if (err instanceof ApiError && err.status === 403) {
          setState('forbidden')
          return
        }
        setState('error')
      })
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (canManageSport) {
      fetchFederations()
        .then(setFederations)
        .catch(() => setFederations([]))
    }
  }, [canManageSport])

  return (
    <>
      <PageHeader
        title="Спортсмены"
        description="Спортсмены федераций и их страховой статус"
        action={
          canManageSport ? (
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Создать спортсмена
            </Button>
          ) : undefined
        }
      />
      {canManageSport ? (
        <AthleteFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          federations={federations}
          onSaved={() => load()}
        />
      ) : null}
      <div className="px-6 py-8 lg:px-10">
        {state === 'loading' ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="space-y-px bg-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-muted/30" />
              ))}
            </div>
          </div>
        ) : state === 'forbidden' ? (
          <StatePanel icon={ShieldX} message="Доступ к спортсменам ограничен для вашей роли." />
        ) : state === 'error' ? (
          <StatePanel
            icon={Inbox}
            message="Не удалось загрузить спортсменов. Попробуйте обновить страницу."
          />
        ) : athletes.length === 0 ? (
          <StatePanel icon={Users} message="Спортсменов пока нет." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {[
                      'ФИО',
                      'Федерация',
                      'Клуб',
                      'Тренер',
                      'Разряд',
                      'Вес',
                      'Вид спорта',
                      'Статус',
                      'Полис',
                    ].map((h) => (
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
                  {athletes.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => router.push(`/athletes/${a.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {formatPersonName(a)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.federation?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.club ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.coach ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.grade ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {a.weight !== null ? `${a.weight} кг` : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.sport_name ?? '—'}</td>
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
        )}
      </div>
    </>
  )
}
