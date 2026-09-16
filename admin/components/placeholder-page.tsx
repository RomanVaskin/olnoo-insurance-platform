import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: LucideIcon
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="px-6 py-8 lg:px-10">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-24 text-center">
          <div className="flex size-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
            <Icon className="size-5" />
          </div>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground text-pretty">
            Этот раздел находится в разработке и появится в ближайшем обновлении платформы.
          </p>
        </div>
      </div>
    </>
  )
}
