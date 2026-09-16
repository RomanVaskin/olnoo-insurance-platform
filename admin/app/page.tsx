'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { KpiCards } from '@/components/policies/kpi-cards'
import { NumberPools } from '@/components/policies/number-pools'
import { IssuedPolicies } from '@/components/policies/issued-policies'
import { ImportNumbersPanel } from '@/components/policies/import-numbers-panel'
import { Button } from '@/components/ui/button'
import type { PolicyType } from '@/lib/policy-data'

export default function PoliciesPage() {
  const [importOpen, setImportOpen] = useState(false)
  const [importType, setImportType] = useState<PolicyType>('VK')

  function openImport(type: PolicyType) {
    setImportType(type)
    setImportOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Полисы"
        description="Управление пулами номеров и выпущенными страховыми полисами"
        action={
          <Button size="lg" onClick={() => openImport('VK')}>
            <Plus className="size-4" />
            Загрузить номера
          </Button>
        }
      />

      <div className="px-6 py-8 lg:px-10">
        <KpiCards />
        <NumberPools onImport={openImport} />
        <IssuedPolicies />
      </div>

      <ImportNumbersPanel
        open={importOpen}
        initialType={importType}
        onClose={() => setImportOpen(false)}
      />
    </>
  )
}
