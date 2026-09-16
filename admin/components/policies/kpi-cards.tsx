import { kpis } from '@/lib/policy-data'

export function KpiCards() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {kpis.map((kpi) => (
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
  )
}
