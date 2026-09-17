import Link from 'next/link'
import { ChevronRight, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/page-header'

const sections = [
  {
    href: '/settings/payments',
    title: 'Платежи',
    description: 'Провайдер оплаты, статус подключения YooKassa и проверка соединения',
    icon: Wallet,
  },
]

export default function Page() {
  return (
    <>
      <PageHeader
        title="Настройки"
        description="Настройки платформы, страховщиков, интеграций и прав доступа"
      />
      <div className="px-6 py-8 lg:px-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <Link
                key={section.href}
                href={section.href}
                className="group flex flex-col gap-3 rounded-xl border border-border p-5 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div>
                  <div className="text-sm font-medium">{section.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground text-pretty">{section.description}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
