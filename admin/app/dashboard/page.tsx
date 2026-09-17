'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { StatePanel } from '@/components/applications/state-panel'
import { ApiError, fetchDashboard, type DashboardData } from '@/lib/api'
import { useAccount } from '@/lib/auth-context'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

function formatKopecks(kopecks: number) {
  return rubFormatter.format(kopecks / 100)
}

function buildKpis(data: DashboardData, role: string | undefined) {
  const isFederationStaff = role === 'federation_secretary' || role === 'federation_director'

  if (isFederationStaff) {
    const kpis = [
      { label: 'Спортсмены', value: String(data.total_athletes) },
      { label: 'Заявки', value: String(data.total_applications) },
      { label: 'Полисы всего', value: String(data.total_policies) },
      { label: 'Активные полисы', value: String(data.active_policies) },
    ]
    if (typeof data.paid_amount_kopecks === 'number') {
      kpis.push({ label: 'Оплачено', value: formatKopecks(data.paid_amount_kopecks) })
    }
    return kpis
  }

  return [
    { label: 'Федерации', value: String(data.total_federations) },
    { label: 'Спортсмены', value: String(data.total_athletes) },
    { label: 'Заявки', value: String(data.total_applications) },
    { label: 'Полисы всего', value: String(data.total_policies) },
    { label: 'Активные полисы', value: String(data.active_policies) },
    {
      label: 'Оплачено',
      value:
        typeof data.paid_amount_kopecks === 'number'
          ? formatKopecks(data.paid_amount_kopecks)
          : 'Недоступно',
    },
  ]
}

export default function Page() {
  const router = useRouter()
  const account = useAccount()
  const [data, setData] = useState<DashboardData | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    let cancelled = false

    setState('loading')

    fetchDashboard()
      .then((result) => {
        if (cancelled) return
        setData(result)
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
        title="Обзор"
        description="Сводная аналитика по полисам, пулам номеров и операционной активности"
      />
      <div className="px-6 py-8 lg:px-10">
        {state === 'loading' ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[92px] animate-pulse rounded-xl border border-border bg-muted/30"
              />
            ))}
          </div>
        ) : state === 'forbidden' ? (
          <StatePanel icon={ShieldX} message="Доступ к сводке ограничен для вашей роли." />
        ) : state === 'error' ? (
          <StatePanel
            icon={Inbox}
            message="Не удалось загрузить данные дашборда. Попробуйте обновить страницу."
          />
        ) : data ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
            {buildKpis(data, account?.role).map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-border bg-card px-5 py-5 transition-colors hover:border-foreground/20"
              >
                <div className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                  {kpi.value}
                </div>
                <div className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  )
}
