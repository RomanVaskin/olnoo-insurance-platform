import { PageHeader } from '@/components/page-header'
import { IssuedPolicies } from '@/components/policies/issued-policies'

export default function PoliciesListPage() {
  return (
    <>
      <PageHeader title="Полисы" description="Полисы, оформленные по вашей федерации" />
      <div className="px-6 py-8 lg:px-10">
        <IssuedPolicies />
      </div>
    </>
  )
}
