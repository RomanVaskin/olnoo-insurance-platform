import { Settings } from 'lucide-react'
import { PlaceholderPage } from '@/components/placeholder-page'

export default function Page() {
  return (
    <PlaceholderPage
      title="Настройки"
      description="Настройки платформы, страховщиков, интеграций и прав доступа"
      icon={Settings}
    />
  )
}
