'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { StatePanel } from '@/components/applications/state-panel'
import { ApiError, fetchPayments, type Payment } from '@/lib/api'
import { formatDateTime, formatKopecks, formatPaymentStatus, formatPersonName } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

export default function Page() {
  const router = useRouter()
  const [payments, setPayments] = useState<Payment[]>([])
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    let cancelled = false

    setState('loading')

    fetchPayments()
      .then((result) => {
        if (cancelled) return
        setPayments(result)
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
      <PageHeader title="Платежи" description="Платежи по заявкам на оформление полисов" />
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
          <StatePanel icon={ShieldX} message="Доступ к платежам ограничен для вашей роли." />
        ) : state === 'error' ? (
          <StatePanel icon={Inbox} message="Не удалось загрузить платежи. Попробуйте обновить страницу." />
        ) : payments.length === 0 ? (
          <StatePanel icon={Inbox} message="Платежей пока нет." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {['Плательщик', 'Федерация', 'Продукт', 'Статус', 'Сумма', 'Полис', 'Создан'].map((h) => (
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
                  {payments.map((pay) => (
                    <tr
                      key={pay.id}
                      onClick={() => router.push(`/payments/${pay.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {formatPersonName(pay.person)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{pay.federation?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{pay.product.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatPaymentStatus(pay.status)}</td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {formatKopecks(pay.amount_kopecks)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {pay.policy_number ?? '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatDateTime(pay.created_at)}
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
