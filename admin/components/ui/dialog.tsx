'use client'

import type { ReactNode } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card px-6 py-6 shadow-lg outline-none">
          <div className="mb-4 flex items-center justify-between">
            <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
