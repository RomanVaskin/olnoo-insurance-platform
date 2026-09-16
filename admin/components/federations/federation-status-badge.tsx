import { cn } from '@/lib/utils'

const labels: Record<string, string> = {
  active: 'Активна',
  inactive: 'Неактивна',
}

export function FederationStatusBadge({ status }: { status: string }) {
  const active = status === 'active'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        active ? 'bg-foreground text-background' : 'border border-border bg-background text-foreground',
      )}
    >
      {labels[status] ?? status}
    </span>
  )
}
