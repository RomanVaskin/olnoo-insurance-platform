import { BadgeCheck } from 'lucide-react'
import { PlaceholderPage } from '@/components/placeholder-page'

export default function Page() {
  return (
    <PlaceholderPage
      title="Выпущенные полисы"
      description="Полный реестр выпущенных страховых полисов с историей и статусами"
      icon={BadgeCheck}
    />
  )
}
