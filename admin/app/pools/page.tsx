import { Layers } from 'lucide-react'
import { PlaceholderPage } from '@/components/placeholder-page'

export default function Page() {
  return (
    <PlaceholderPage
      title="Пулы номеров"
      description="Управление пулами номеров полисов по страховщикам и продуктам"
      icon={Layers}
    />
  )
}
