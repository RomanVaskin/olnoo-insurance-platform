'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileQuestion, Inbox, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ProductStatusBadge } from '@/components/products/product-status-badge'
import { StatePanel } from '@/components/applications/state-panel'
import { ApiError, fetchProduct, type ProductDetail } from '@/lib/api'
import { formatKopecks } from '@/lib/utils'

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
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    let cancelled = false

    setState('loading')

    fetchProduct(params.id)
      .then((result) => {
        if (cancelled) return
        setProduct(result)
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
        title="Страховой продукт"
        description={product ? product.name : undefined}
        action={
          <Button variant="outline" size="lg" onClick={() => router.push('/products')}>
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
          <StatePanel icon={ShieldX} message="Доступ к этому продукту ограничен для вашей роли." />
        ) : state === 'not_found' ? (
          <StatePanel icon={FileQuestion} message="Продукт не найден." />
        ) : state === 'error' ? (
          <StatePanel
            icon={Inbox}
            message="Не удалось загрузить данные продукта. Попробуйте обновить страницу."
          />
        ) : product ? (
          <div className="space-y-4">
            <Card title="Продукт">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Название" value={product.name} />
                <Field label="Категория" value={product.category} />
                <Field label="Страховщик" value={product.insurer_name ?? '—'} />
                <Field label="Статус" value={<ProductStatusBadge status={product.status} />} />
                <Field
                  label="Покрытие"
                  value={
                    product.coverage_amount_kopecks !== null
                      ? formatKopecks(product.coverage_amount_kopecks)
                      : '—'
                  }
                />
                <Field label="Срок действия" value={`${product.validity_days} дн.`} />
                <Field label="Базовая цена" value={formatKopecks(product.base_price_kopecks)} />
                <Field label="ID" value={<span className="font-mono text-xs">{product.id}</span>} />
              </div>
            </Card>

            <Card title="Назначения федераций">
              {product.federation_assignments.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                          {['Федерация', 'Цена', 'Активно'].map((h) => (
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
                        {product.federation_assignments.map((a) => (
                          <tr
                            key={a.id}
                            onClick={() => router.push(`/federations/${a.federation.id}`)}
                            className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                          >
                            <td className="px-4 py-3 font-medium whitespace-nowrap">{a.federation.name}</td>
                            <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                              {formatKopecks(a.price_kopecks)}
                            </td>
                            <td className="px-4 py-3">
                              {a.active ? (
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
                <p className="text-sm text-muted-foreground">Продукт не назначен ни одной федерации</p>
              )}
            </Card>
          </div>
        ) : null}
      </div>
    </>
  )
}
