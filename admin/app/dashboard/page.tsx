'use client'

import { useEffect, useState } from 'react'
import { LayoutDashboard } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { fetchDashboard, type DashboardData } from '@/lib/api'

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

function formatKopecks(kopecks: number) {
  return rubFormatter.format(kopecks / 100)
}

function buildKpis(data: DashboardData) {
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
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(false)

    fetchDashboard()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Сводная аналитика по полисам, пулам номеров и операционной активности"
      />
      <div className="px-6 py-8 lg:px-10">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[92px] animate-pulse rounded-xl border border-border bg-muted/30"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-24 text-center">
            <div className="flex size-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
              <LayoutDashboard className="size-5" />
            </div>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground text-pretty">
              Не удалось загрузить данные дашборда. Попробуйте обновить страницу.
            </p>
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
            {buildKpis(data).map((kpi) => (
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
