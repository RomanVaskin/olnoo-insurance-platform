'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, KeyRound, Pencil, Plus, ShieldX, UserCog } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { UserStatusBadge } from '@/components/users/user-status-badge'
import { UserFormDialog } from '@/components/users/user-form-dialog'
import { ResetPasswordDialog } from '@/components/users/reset-password-dialog'
import { StatePanel } from '@/components/applications/state-panel'
import { useAccount } from '@/lib/auth-context'
import { getRoleLabel } from '@/lib/auth'
import { ApiError, fetchFederations, fetchUsers, type Federation, type PlatformUser } from '@/lib/api'
import { formatPersonName } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

// Only these roles can be created/edited from this page — athlete/guardian accounts
// stay under Athletes CRUD and are shown here read-only, for visibility only.
const MANAGED_ROLES = ['super_admin', 'admin', 'federation_secretary', 'federation_director']

export default function Page() {
  const router = useRouter()
  const account = useAccount()
  const isSuperAdmin = account?.role === 'super_admin'
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [federations, setFederations] = useState<Federation[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null)
  const [resetUser, setResetUser] = useState<PlatformUser | null>(null)

  const load = useCallback(() => {
    setState('loading')

    return fetchUsers()
      .then((result) => {
        setUsers(result)
        setState('ready')
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login')
          return
        }
        if (err instanceof ApiError && err.status === 403) {
          setState('forbidden')
          return
        }
        setState('error')
      })
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (isSuperAdmin) {
      fetchFederations()
        .then(setFederations)
        .catch(() => setFederations([]))
    }
  }, [isSuperAdmin])

  return (
    <>
      <PageHeader
        title="Пользователи"
        description="Аккаунты платформы и сотрудники федераций"
        action={
          isSuperAdmin ? (
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Создать пользователя
            </Button>
          ) : undefined
        }
      />
      {isSuperAdmin ? (
        <>
          <UserFormDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            federations={federations}
            onSaved={() => load()}
          />
          <UserFormDialog
            open={editingUser !== null}
            onOpenChange={(next) => {
              if (!next) setEditingUser(null)
            }}
            federations={federations}
            user={editingUser}
            isSelf={editingUser?.id === account?.id}
            onSaved={() => load()}
          />
          <ResetPasswordDialog
            open={resetUser !== null}
            onOpenChange={(next) => {
              if (!next) setResetUser(null)
            }}
            user={resetUser}
            onDone={() => {}}
          />
        </>
      ) : null}
      <div className="px-6 py-8 lg:px-10">
        {state === 'loading' ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="space-y-px bg-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-muted/30" />
              ))}
            </div>
          </div>
        ) : state === 'forbidden' ? (
          <StatePanel icon={ShieldX} message="Доступ к пользователям ограничен для вашей роли." />
        ) : state === 'error' ? (
          <StatePanel icon={Inbox} message="Не удалось загрузить пользователей. Попробуйте обновить страницу." />
        ) : users.length === 0 ? (
          <StatePanel icon={UserCog} message="Пользователей пока нет." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {['Пользователь', 'Роль', 'Федерация', 'Статус', ...(isSuperAdmin ? ['Действия'] : [])].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const managed = MANAGED_ROLES.includes(u.role)
                    return (
                      <tr
                        key={u.id}
                        onClick={() => router.push(`/users/${u.id}`)}
                        className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                      >
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          {u.person ? formatPersonName(u.person) : (u.email ?? '—')}
                          {u.person && u.email ? (
                            <div className="text-xs font-normal text-muted-foreground">{u.email}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{getRoleLabel(u.role)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.federation?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <UserStatusBadge status={u.status} />
                        </td>
                        {isSuperAdmin ? (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {managed ? (
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon-sm" onClick={() => setEditingUser(u)}>
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon-sm" onClick={() => setResetUser(u)}>
                                  <KeyRound className="size-3.5" />
                                </Button>
                              </div>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
