import { cn } from '@/lib/utils'

export function InsuredStatusBadge({ insured }: { insured: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        insured ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
      )}
    >
      {insured ? 'Застрахован' : 'Не застрахован'}
    </span>
  )
}
