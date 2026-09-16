import { cn } from '@/lib/utils'
import type { PolicyStatus } from '@/lib/api'

const labels: Record<PolicyStatus, string> = {
  active: 'Действует',
  cancelled: 'Отменён',
  expired: 'Истёк',
}

const styles: Record<PolicyStatus, string> = {
  active: 'bg-foreground text-background',
  cancelled: 'bg-destructive/10 text-destructive',
  expired: 'border border-border bg-background text-foreground',
}

export function PolicyStatusBadge({ status }: { status: PolicyStatus }) {
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
