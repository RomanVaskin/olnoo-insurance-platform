'use client'

import { PageHeader } from '@/components/page-header'
import { StatePanel } from '@/components/applications/state-panel'
import { ImportTypeCard } from '@/components/imports/import-type-card'
import { useAccount } from '@/lib/auth-context'
import { ShieldX } from 'lucide-react'

export default function Page() {
  const account = useAccount()
  const isSuperAdmin = account?.role === 'super_admin'

  return (
    <>
      <PageHeader title="Импорт данных" description="Массовый импорт данных платформы из файлов .xlsx" />
      <div className="px-6 py-8 lg:px-10">
        {!isSuperAdmin ? (
          <StatePanel icon={ShieldX} message="Импорт данных доступен только супер-админу." />
        ) : (
          <div className="space-y-4">
            <ImportTypeCard
              type="federations"
              title="Федерации"
              description="Создание и обновление федераций по slug."
            />
            <ImportTypeCard
              type="athletes"
              title="Спортсмены"
              description="Создание и обновление спортсменов и их членства в федерациях."
            />
            <ImportTypeCard
              type="products"
              title="Страховые продукты"
              description="Создание и обновление страховых продуктов по названию."
            />
            <ImportTypeCard
              type="assignments"
              title="Назначения продуктов федерациям"
              description="Назначение страховых продуктов федерациям с ценой."
            />
          </div>
        )}
      </div>
    </>
  )
}
