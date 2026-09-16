'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import {
  LayoutDashboard,
  FileText,
  Layers,
  BadgeCheck,
  FileOutput,
  FileStack,
  Inbox,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand-logo'

const nav = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Полисы', href: '/', icon: FileText },
  { label: 'Пулы номеров', href: '/pools', icon: Layers },
  { label: 'Выпущенные полисы', href: '/issued', icon: BadgeCheck },
  { label: 'Генератор PDF', href: '/pdf-generator', icon: FileOutput },
  { label: 'Шаблоны', href: '/templates', icon: FileStack },
  { label: 'Заявки', href: '/applications', icon: Inbox },
  { label: 'Настройки', href: '/settings', icon: Settings },
]

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col">
      {/* Wordmark */}
      <div className="px-6 py-6">
        <BrandLogo height={20} />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {nav.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
            А
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-medium">Administrator</div>
            <div className="truncate text-xs text-muted-foreground">admin@olnoo.ru</div>
          </div>
        </div>
        <button
          type="button"
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
          <span>Выйти</span>
        </button>
      </div>
    </div>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar lg:block">
        <div className="sticky top-0 h-screen">
          <NavContent />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <BrandLogo height={16} showLabel={false} />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex size-9 items-center justify-center rounded-lg border border-border"
          aria-label="Открыть меню"
        >
          <Menu className="size-4.5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-border bg-sidebar shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 flex size-8 items-center justify-center rounded-lg border border-border bg-background"
              aria-label="Закрыть меню"
            >
              <X className="size-4" />
            </button>
            <NavContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <main className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</main>
    </div>
  )
}
