'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { ApplicationStatusBadge } from '@/components/applications/application-status-badge'
import { StatePanel } from '@/components/applications/state-panel'
import { ApiError, fetchApplications, type Application } from '@/lib/api'
import { formatDateTime, formatKopecks, formatPersonName } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

export default function Page() {
  const router = useRouter()
  const [applications, setApplications] = useState<Application[]>([])
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    let cancelled = false

    setState('loading')

    fetchApplications()
      .then((result) => {
        if (cancelled) return
        setApplications(result)
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
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <>
      <PageHeader
        title="Заявки"
        description="Входящие заявки на оформление полисов и их обработка"
      />
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
          <StatePanel icon={ShieldX} message="Доступ к заявкам ограничен для вашей роли." />
        ) : state === 'error' ? (
          <StatePanel
            icon={Inbox}
            message="Не удалось загрузить заявки. Попробуйте обновить страницу."
          />
        ) : applications.length === 0 ? (
          <StatePanel icon={Inbox} message="Заявок пока нет." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {['Заявитель', 'Федерация', 'Продукт', 'Статус', 'Сумма', 'Создана'].map((h) => (
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
                  {applications.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => router.push(`/applications/${a.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {formatPersonName(a.person)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.federation?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.product.name}</td>
                      <td className="px-4 py-3">
                        <ApplicationStatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {formatKopecks(a.amount_kopecks)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatDateTime(a.created_at)}
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
