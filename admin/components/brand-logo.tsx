import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Official OLNOO wordmark. Rendered from the source asset — never recreated as text.
 * Aspect ratio is locked to the original artwork so it is never stretched.
 */
export function BrandLogo({
  height = 20,
  showLabel = true,
  className,
}: {
  height?: number
  showLabel?: boolean
  className?: string
}) {
  // Intrinsic artwork ratio (~5.7:1) preserved so the mark keeps its proportions.
  const width = Math.round(height * 5.72)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Image
        src="/olnoo-logo.png"
        alt="OLNOO"
        width={width}
        height={height}
        priority
        className="h-auto w-auto object-contain"
        style={{ height, width }}
      />
      {showLabel && (
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Insurance
        </span>
      )}
    </div>
  )
}
