import { cn } from '@/lib/utils'
import type { ApplicationStatus } from '@/lib/api'

const labels: Record<ApplicationStatus, string> = {
  draft: 'Черновик',
  pending_payment: 'Ожидает оплаты',
  paid: 'Оплачено',
  policy_issued: 'Полис выпущен',
  cancelled: 'Отменена',
}

const styles: Record<ApplicationStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_payment: 'border border-border bg-background text-foreground',
  paid: 'border border-border bg-background text-foreground',
  policy_issued: 'bg-foreground text-background',
  cancelled: 'bg-destructive/10 text-destructive',
}

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        styles[status],
      )}
    >
      {labels[status] ?? status}
    </span>
  )
}
