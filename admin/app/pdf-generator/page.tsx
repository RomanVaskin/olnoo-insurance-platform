'use client'

import { useState } from 'react'
import { FileOutput, Download, ExternalLink, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import type { PolicyType } from '@/lib/policy-data'

const types: PolicyType[] = ['VK', 'VI', 'SYS']

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export default function PdfGeneratorPage() {
  const [type, setType] = useState<PolicyType>('VK')
  const [generated, setGenerated] = useState(false)

  return (
    <>
      <PageHeader
        title="Генерация полиса"
        description="Формирование PDF-документа страхового полиса по данным застрахованного"
      />

      <div className="px-6 py-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Form */}
          <form
            className="max-w-2xl space-y-6"
            onSubmit={(e) => {
              e.preventDefault()
              setGenerated(true)
            }}
          >
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Параметры полиса
              </h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <Field label="Тип полиса">
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
                </Field>
                <Field label="Номер полиса">
                  <div className="flex h-9 items-center rounded-lg border border-dashed border-border bg-muted/40 px-3 font-mono text-sm text-muted-foreground">
                    зарезервируется автоматически
                  </div>
                </Field>
                <Field label="Дата договора">
                  <input type="text" defaultValue="05.09.2026" className={inputClass} />
                </Field>
                <Field label="Дата начала">
                  <input type="text" defaultValue="05.09.2026" className={inputClass} />
                </Field>
                <Field label="Дата окончания">
                  <input type="text" defaultValue="05.09.2026" className={inputClass} />
                </Field>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Застрахованный
              </h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-3">
                <Field label="Фамилия">
                  <input type="text" placeholder="Иванов" className={inputClass} />
                </Field>
                <Field label="Имя">
                  <input type="text" placeholder="Иван" className={inputClass} />
                </Field>
                <Field label="Отчество">
                  <input type="text" placeholder="Иванович" className={inputClass} />
                </Field>
              </div>
            </div>

            <Button type="submit" size="lg">
              <FileOutput className="size-4" />
              Сформировать полис
            </Button>
          </form>

          {/* Result */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            {generated ? (
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
                  <CheckCircle2 className="size-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">Полис сформирован</h3>
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  {type}7377383
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <Button size="lg">
                    <Download className="size-4" />
                    Скачать PDF
                  </Button>
                  <Button variant="outline" size="lg">
                    <ExternalLink className="size-4" />
                    Открыть полис
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                  <FileOutput className="size-5" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground text-pretty">
                  Заполните форму и нажмите «Сформировать полис», чтобы создать документ.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
