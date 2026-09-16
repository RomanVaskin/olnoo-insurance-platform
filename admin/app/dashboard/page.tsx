import { LayoutDashboard } from 'lucide-react'
import { PlaceholderPage } from '@/components/placeholder-page'

export default function Page() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="Сводная аналитика по полисам, пулам номеров и операционной активности"
      icon={LayoutDashboard}
    />
  )
}
