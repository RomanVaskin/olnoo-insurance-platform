'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Inbox, Plus, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { FederationStatusBadge } from '@/components/federations/federation-status-badge'
import { FederationFormDialog } from '@/components/federations/federation-form-dialog'
import { StatePanel } from '@/components/applications/state-panel'
import { useAccount } from '@/lib/auth-context'
import { ApiError, fetchFederations, type Federation } from '@/lib/api'
import { formatKopecks } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

export default function Page() {
  const router = useRouter()
  const account = useAccount()
  const [federations, setFederations] = useState<Federation[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(() => {
    setState('loading')

    return fetchFederations()
      .then((result) => {
        setFederations(result)
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

  const showFinance = federations.length > 0 && federations[0].paid_amount_kopecks !== undefined

  return (
    <>
      <PageHeader
        title="Федерации"
        description="Федерации, подключённые к платформе"
        action={
          account?.role === 'super_admin' ? (
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Создать федерацию
            </Button>
          ) : undefined
        }
      />
      {account?.role === 'super_admin' ? (
        <FederationFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
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
          <StatePanel icon={ShieldX} message="Доступ к федерациям ограничен для вашей роли." />
        ) : state === 'error' ? (
          <StatePanel
            icon={Inbox}
            message="Не удалось загрузить федерации. Попробуйте обновить страницу."
          />
        ) : federations.length === 0 ? (
          <StatePanel icon={Building2} message="Федераций пока нет." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {[
                      'Название',
                      'Slug',
                      'Статус',
                      'Спортсменов',
                      ...(showFinance ? ['Полисов', 'Оплачено'] : []),
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
                  {federations.map((f) => (
                    <tr
                      key={f.id}
                      onClick={() => router.push(`/federations/${f.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{f.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{f.slug}</td>
                      <td className="px-4 py-3">
                        <FederationStatusBadge status={f.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {f.athlete_count}
                      </td>
                      {showFinance ? (
                        <>
                          <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                            {f.policy_count}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                            {f.paid_amount_kopecks !== undefined ? formatKopecks(f.paid_amount_kopecks) : '—'}
                          </td>
                        </>
                      ) : null}
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
