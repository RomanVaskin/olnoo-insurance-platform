'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { LogOut, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand-logo'
import { getCurrentAccount, getRoleLabel, logout, type Account } from '@/lib/auth'
import { AccountContext } from '@/lib/auth-context'
import { getNavForRole, type NavItem } from '@/lib/nav'
import { fetchFederations } from '@/lib/api'

function NavContent({
  items,
  roleLabel,
  email,
  federationName,
  onNavigate,
}: {
  items: NavItem[]
  roleLabel: string
  email: string | null
  federationName: string | null
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await logout()
    router.replace('/login')
  }

  const initials = (email ?? roleLabel).trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="flex h-full flex-col">
      {/* Wordmark */}
      <div className="px-6 py-6">
        <BrandLogo height={20} />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {items.map((item) => {
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
            {initials}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-medium">{roleLabel}</div>
            <div className="truncate text-xs text-muted-foreground">{federationName ?? email ?? ''}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
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
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [federationName, setFederationName] = useState<string | null>(null)

  const isLoginPage = pathname === '/login'

  useEffect(() => {
    if (isLoginPage) return

    let cancelled = false

    getCurrentAccount().then((acc) => {
      if (cancelled) return
      if (acc && ['super_admin', 'admin', 'federation_secretary', 'federation_director'].includes(acc.role)) {
        setAccount(acc)
        setAuthorized(true)
      } else if (acc) {
        void logout().finally(() => router.replace('/login'))
      } else {
        router.replace('/login')
      }
    })

    return () => {
      cancelled = true
    }
  }, [isLoginPage, router])

  useEffect(() => {
    if (!account || (account.role !== 'federation_secretary' && account.role !== 'federation_director')) {
      setFederationName(null)
      return
    }

    let cancelled = false

    fetchFederations()
      .then((federations) => {
        if (cancelled) return
        setFederationName(federations[0]?.name ?? null)
      })
      .catch(() => {
        if (!cancelled) setFederationName(null)
      })

    return () => {
      cancelled = true
    }
  }, [account])

  if (isLoginPage) {
    return <>{children}</>
  }

  if (!authorized || !account) {
    return <div className="min-h-screen bg-background" />
  }

  const navItems = getNavForRole(account.role)
  const roleLabel = getRoleLabel(account.role)

  return (
    <AccountContext.Provider value={account}>
      <div className="flex min-h-screen bg-background">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar lg:block">
          <div className="sticky top-0 h-screen">
            <NavContent
              items={navItems}
              roleLabel={roleLabel}
              email={account.email}
              federationName={federationName}
            />
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
              <NavContent
                items={navItems}
                roleLabel={roleLabel}
                email={account.email}
                federationName={federationName}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Main */}
        <main className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</main>
      </div>
    </AccountContext.Provider>
  )
}
