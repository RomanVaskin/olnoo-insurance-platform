import { Inbox } from 'lucide-react'
import { PlaceholderPage } from '@/components/placeholder-page'

export default function Page() {
  return (
    <PlaceholderPage
      title="Заявки"
      description="Входящие заявки на оформление полисов и их обработка"
      icon={Inbox}
    />
  )
}
