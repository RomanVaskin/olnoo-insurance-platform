'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { PolicyType } from '@/lib/policy-data'
import { Button } from '@/components/ui/button'

const types: PolicyType[] = ['VK', 'VI', 'SYS']

export function ImportNumbersPanel({
  open,
  initialType,
  onClose,
}: {
  open: boolean
  initialType: PolicyType
  onClose: () => void
}) {
  const [type, setType] = useState<PolicyType>(initialType)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (open) {
      setType(initialType)
    }
  }, [open, initialType])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lightweight preview computation over pasted numbers.
  const lines = value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const unique = new Set(lines)
  const duplicates = lines.length - unique.size
  const rejected = Array.from(unique).filter((l) => !/^[A-Z]{2}\d{6,}$/.test(l)).length
  const added = unique.size - rejected

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Загрузить номера</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Добавьте номера полисов в пул, по одному в строке.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted"
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <div>
            <label className="mb-2 block text-sm font-medium">Тип полиса</label>
            <div className="grid grid-cols-3 gap-2">
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`h-9 rounded-lg border font-mono text-sm transition-colors ${
                    type === t
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background hover:bg-muted'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="numbers" className="mb-2 block text-sm font-medium">
              Номера полисов
            </label>
            <textarea
              id="numbers"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={10}
              placeholder={'VK1234567890\nVK1234567891\nVK1234567892'}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <p className="mt-2 text-xs text-muted-foreground">Один номер в строке</p>
          </div>

          {/* Preview summary */}
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Добавлено</span>
              <span className="font-medium tabular-nums">{added}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Дубликатов</span>
              <span className="font-medium tabular-nums">{duplicates}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Отклонено</span>
              <span className="font-medium tabular-nums">{rejected}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" size="lg" onClick={onClose}>
            Отмена
          </Button>
          <Button size="lg" onClick={onClose} disabled={added === 0}>
            Загрузить
          </Button>
        </div>
      </div>
    </div>
  )
}
