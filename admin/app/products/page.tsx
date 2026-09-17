'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, PackageSearch, Plus, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ProductStatusBadge } from '@/components/products/product-status-badge'
import { ProductFormDialog } from '@/components/products/product-form-dialog'
import { StatePanel } from '@/components/applications/state-panel'
import { useAccount } from '@/lib/auth-context'
import { getInsuranceTypeLabel, getManageableInsuranceTypes } from '@/lib/auth'
import { ApiError, fetchProducts, type Product } from '@/lib/api'
import { formatKopecks } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

export default function Page() {
  const router = useRouter()
  const account = useAccount()
  const [products, setProducts] = useState<Product[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [createOpen, setCreateOpen] = useState(false)
  const manageableCategories = getManageableInsuranceTypes(account)

  const load = useCallback(() => {
    setState('loading')

    return fetchProducts()
      .then((result) => {
        setProducts(result)
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

  return (
    <>
      <PageHeader
        title="Страховые продукты"
        description="Каталог страховых продуктов платформы"
        action={
          manageableCategories.length > 0 ? (
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Создать продукт
            </Button>
          ) : undefined
        }
      />
      {manageableCategories.length > 0 ? (
        <ProductFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          allowedCategories={manageableCategories}
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
          <StatePanel icon={ShieldX} message="Доступ к продуктам ограничен для вашей роли." />
        ) : state === 'error' ? (
          <StatePanel
            icon={Inbox}
            message="Не удалось загрузить продукты. Попробуйте обновить страницу."
          />
        ) : products.length === 0 ? (
          <StatePanel icon={PackageSearch} message="Продуктов пока нет." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {['Название', 'Категория', 'Страховщик', 'Покрытие', 'Срок', 'Базовая цена', 'Статус'].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/products/${p.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{getInsuranceTypeLabel(p.category)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.insurer_name ?? '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {p.coverage_amount_kopecks !== null ? formatKopecks(p.coverage_amount_kopecks) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {p.validity_days} дн.
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {formatKopecks(p.base_price_kopecks)}
                      </td>
                      <td className="px-4 py-3">
                        <ProductStatusBadge status={p.status} />
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
