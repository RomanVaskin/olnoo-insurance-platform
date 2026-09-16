'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Download, RotateCcw, Inbox, ShieldX } from 'lucide-react'
import { ApiError, fetchPolicies, type Policy, type PolicyStatus } from '@/lib/api'
import { formatDateTime, formatPersonName } from '@/lib/utils'
import { PolicyStatusBadge } from '@/components/policies/policy-status-badge'
import { StatePanel } from '@/components/applications/state-panel'
import { Button } from '@/components/ui/button'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

const statusOptions: (PolicyStatus | 'Все статусы')[] = ['Все статусы', 'active', 'cancelled', 'expired']

const statusLabels: Record<(typeof statusOptions)[number], string> = {
  'Все статусы': 'Все статусы',
  active: 'Действует',
  cancelled: 'Отменён',
  expired: 'Истёк',
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  label: string
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {statusLabels[o as keyof typeof statusLabels] ?? o}
          </option>
        ))}
      </select>
    </label>
  )
}

export function IssuedPolicies() {
  const router = useRouter()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>('Все статусы')

  useEffect(() => {
    let cancelled = false

    setState('loading')

    fetchPolicies()
      .then((result) => {
        if (cancelled) return
        setPolicies(result)
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

  const filtered = useMemo(() => {
    return policies.filter((p) => {
      if (statusFilter !== 'Все статусы' && p.status !== statusFilter) return false
      if (query.trim()) {
        const q = query.trim().toLowerCase()
        const hay = `${p.policy_number} ${formatPersonName(p.person)} ${p.federation?.name ?? ''} ${p.product.name}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [policies, query, statusFilter])

  function reset() {
    setQuery('')
    setStatusFilter('Все статусы')
  }

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Выпущенные полисы</h2>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по номеру, ФИО, федерации, продукту"
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select label="Статус" value={statusFilter} onChange={(v) => setStatusFilter(v as (typeof statusOptions)[number])} options={statusOptions} />
          <Button variant="ghost" size="lg" onClick={reset}>
            <RotateCcw className="size-4" />
            Сбросить
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4">
        {state === 'loading' ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="space-y-px bg-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-muted/30" />
              ))}
            </div>
          </div>
        ) : state === 'forbidden' ? (
          <StatePanel icon={ShieldX} message="Доступ к полисам ограничен для вашей роли." />
        ) : state === 'error' ? (
          <StatePanel icon={Inbox} message="Не удалось загрузить полисы. Попробуйте обновить страницу." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {['Номер', 'Застрахованный', 'Федерация', 'Продукт', 'Статус', 'Действует с', 'Действует по', 'PDF'].map(
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
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/policies/${p.id}`)}
                      className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 font-mono font-medium whitespace-nowrap">{p.policy_number}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatPersonName(p.person)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.federation?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.product.name}</td>
                      <td className="px-4 py-3">
                        <PolicyStatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatDateTime(p.valid_from)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {formatDateTime(p.valid_to)}
                      </td>
                      <td className="px-4 py-3">
                        {p.policy_url ? (
                          <a href={p.policy_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                            <Button variant="outline" size="sm">
                              <Download className="size-3.5" />
                              Скачать
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        Полисы не найдены
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
