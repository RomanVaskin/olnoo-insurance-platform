import { FileStack, Upload, Plus } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'

type Template = {
  type: string
  insurer: string
  file?: string
  active: boolean
}

const templates: Template[] = [
  { type: 'VK', insurer: 'Ингосстрах', file: 'templates/vk.pdf', active: true },
  { type: 'VI', insurer: 'Ингосстрах', active: false },
  { type: 'SYS', insurer: 'РЕСО-Гарантия', active: false },
]

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Шаблоны полисов"
        description="PDF-шаблоны, используемые для генерации страховых полисов по каждому типу"
      />

      <div className="px-6 py-8 lg:px-10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => (
            <div key={tpl.type} className="flex flex-col rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
                    <FileStack className="size-4.5" />
                  </span>
                  <div>
                    <div className="font-mono text-sm font-medium">{tpl.type}</div>
                    <div className="text-xs text-muted-foreground">{tpl.insurer}</div>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    tpl.active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {tpl.active ? 'Активен' : 'Не настроен'}
                </span>
              </div>

              <div className="mt-4 flex h-9 items-center rounded-lg border border-border bg-muted/40 px-3 font-mono text-xs text-muted-foreground">
                {tpl.file ?? 'файл не загружен'}
              </div>

              <div className="mt-4">
                {tpl.active ? (
                  <Button variant="outline" size="lg" className="w-full">
                    <Upload className="size-4" />
                    Заменить шаблон
                  </Button>
                ) : (
                  <Button size="lg" className="w-full">
                    <Plus className="size-4" />
                    Добавить шаблон
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
