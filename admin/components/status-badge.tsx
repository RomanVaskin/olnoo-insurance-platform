import { cn } from '@/lib/utils'

export type PolicyStatus = 'Свободен' | 'Зарезервирован' | 'Выпущен'

const styles: Record<PolicyStatus, string> = {
  Свободен: 'bg-muted text-muted-foreground',
  Зарезервирован: 'border border-border bg-background text-foreground',
  Выпущен: 'bg-foreground text-background',
}

export function StatusBadge({ status }: { status: PolicyStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        styles[status],
      )}
    >
      {status}
    </span>
  )
}
