'use client'

import { Upload, Plus } from 'lucide-react'
import { pools, type PolicyType } from '@/lib/policy-data'
import { Button } from '@/components/ui/button'

function PoolStat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${muted ? 'text-muted-foreground' : ''}`}>
        {value}
      </span>
    </div>
  )
}

export function NumberPools({ onImport }: { onImport: (type: PolicyType) => void }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Пулы номеров</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pools.map((pool) => {
          const disabled = !pool.configured
          return (
            <div
              key={pool.type}
              className={`flex flex-col rounded-xl border border-border bg-card p-5 ${
                disabled ? 'opacity-70' : 'transition-colors hover:border-foreground/20'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs font-medium">
                      {pool.type}
                    </span>
                    {disabled ? (
                      <span className="text-xs text-muted-foreground">Не настроен</span>
                    ) : null}
                  </div>
                  <div className="mt-3 text-sm font-medium">{pool.insurer}</div>
                  <div className="text-sm text-muted-foreground">{pool.product}</div>
                </div>
              </div>

              <div className="mt-4 border-t border-border pt-2">
                <PoolStat label="Свободно" value={pool.free} muted={disabled} />
                <PoolStat label="Зарезервировано" value={pool.reserved} muted={disabled} />
                <PoolStat label="Выпущено" value={pool.issued} muted={disabled} />
              </div>

              <div className="mt-4">
                {disabled ? (
                  <Button variant="outline" size="lg" className="w-full" disabled>
                    <Plus className="size-4" />
                    Настроить пул
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => onImport(pool.type)}
                  >
                    <Upload className="size-4" />
                    Загрузить номера
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
