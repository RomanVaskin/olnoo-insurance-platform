'use client'

import { useMemo, useState } from 'react'
import { Search, Download, RotateCcw } from 'lucide-react'
import { issuedPolicies, tournaments, type PolicyType } from '@/lib/policy-data'
import type { PolicyStatus } from '@/components/status-badge'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'

const typeTabs: (PolicyType | 'Все')[] = ['Все', 'VK', 'VI', 'SYS']
const statusOptions: (PolicyStatus | 'Все статусы')[] = [
  'Все статусы',
  'Свободен',
  'Зарезервирован',
  'Выпущен',
]

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
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

export function IssuedPolicies() {
  const [tab, setTab] = useState<(typeof typeTabs)[number]>('Все')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('Все статусы')
  const [tournamentFilter, setTournamentFilter] = useState('Все турниры')

  const filtered = useMemo(() => {
    return issuedPolicies.filter((p) => {
      if (tab !== 'Все' && p.type !== tab) return false
      if (statusFilter !== 'Все статусы' && p.status !== statusFilter) return false
      if (tournamentFilter !== 'Все турниры' && p.tournament !== tournamentFilter) return false
      if (query.trim()) {
        const q = query.trim().toLowerCase()
        const hay = `${p.number} ${p.insured} ${p.tournament}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tab, query, statusFilter, tournamentFilter])

  function reset() {
    setQuery('')
    setStatusFilter('Все статусы')
    setTournamentFilter('Все турниры')
    setTab('Все')
  }

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Последние выпущенные полисы</h2>
      </div>

      {/* Type tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {typeTabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`relative -mb-px px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-foreground text-foreground'
                : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по номеру, ФИО, турниру"
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="Статус"
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
          />
          <Select
            label="Турнир"
            value={tournamentFilter}
            onChange={setTournamentFilter}
            options={['Все турниры', ...tournaments]}
          />
          <Button variant="ghost" size="lg" onClick={reset}>
            <RotateCcw className="size-4" />
            Сбросить
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                {['Номер', 'Тип', 'Статус', 'Застрахованный', 'Турнир', 'Дата договора', 'Дата выпуска', 'PDF'].map(
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
                  key={p.number}
                  className="border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-mono font-medium">{p.number}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                      {p.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.insured}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.tournament}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                    {p.contractDate}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                    {p.issueDate}
                  </td>
                  <td className="px-4 py-3">
                    {p.status === 'Выпущен' ? (
                      <Button variant="outline" size="sm">
                        <Download className="size-3.5" />
                        Скачать
                      </Button>
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
    </section>
  )
}
