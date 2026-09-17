'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileQuestion, Inbox, KeyRound, Pencil, ShieldX } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { UserStatusBadge } from '@/components/users/user-status-badge'
import { UserFormDialog } from '@/components/users/user-form-dialog'
import { ResetPasswordDialog } from '@/components/users/reset-password-dialog'
import { InsuranceAccessCard } from '@/components/users/insurance-access-card'
import { StatePanel } from '@/components/applications/state-panel'
import { useAccount } from '@/lib/auth-context'
import { getRoleLabel } from '@/lib/auth'
import { ApiError, fetchFederations, fetchUser, type Federation, type PlatformUser } from '@/lib/api'
import { formatDateTime, formatPersonName } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'not_found' | 'error'

const MANAGED_ROLES = ['super_admin', 'admin', 'federation_secretary', 'federation_director']

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  )
}

export default function Page() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const account = useAccount()
  const isSuperAdmin = account?.role === 'super_admin'
  const [user, setUser] = useState<PlatformUser | null>(null)
  const [federations, setFederations] = useState<Federation[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [editOpen, setEditOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const load = useCallback(() => {
    let cancelled = false

    setState('loading')

    fetchUser(params.id)
      .then((result) => {
        if (cancelled) return
        setUser(result)
        setState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login')
          return
        }
        if (err instanceof ApiError && err.status === 403) {
          setState('forbidden')
          return
        }
        if (err instanceof ApiError && err.status === 404) {
          setState('not_found')
          return
        }
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [params.id, router])

  useEffect(() => {
    return load()
  }, [load])

  useEffect(() => {
    if (isSuperAdmin) {
      fetchFederations()
        .then(setFederations)
        .catch(() => setFederations([]))
    }
  }, [isSuperAdmin])

  const managed = user ? MANAGED_ROLES.includes(user.role) : false
  const isSelf = user?.id === account?.id

  return (
    <>
      <PageHeader
        title="Пользователь"
        description={user ? (user.person ? formatPersonName(user.person) : (user.email ?? undefined)) : undefined}
        action={
          <div className="flex gap-2">
            {isSuperAdmin && user && managed ? (
              <>
                <Button variant="outline" size="lg" onClick={() => setResetOpen(true)}>
                  <KeyRound className="size-4" />
                  Сбросить пароль
                </Button>
                <Button variant="outline" size="lg" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  Редактировать
                </Button>
              </>
            ) : null}
            <Button variant="outline" size="lg" onClick={() => router.push('/users')}>
              <ArrowLeft className="size-4" />
              К списку
            </Button>
          </div>
        }
      />
      {isSuperAdmin && user && managed ? (
        <>
          <UserFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            federations={federations}
            user={user}
            isSelf={isSelf}
            onSaved={() => load()}
          />
          <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} user={user} onDone={() => {}} />
        </>
      ) : null}
      <div className="px-6 py-8 lg:px-10">
        {state === 'loading' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-muted/30" />
            ))}
          </div>
        ) : state === 'forbidden' ? (
          <StatePanel icon={ShieldX} message="Доступ к этому пользователю ограничен для вашей роли." />
        ) : state === 'not_found' ? (
          <StatePanel icon={FileQuestion} message="Пользователь не найден." />
        ) : state === 'error' ? (
          <StatePanel icon={Inbox} message="Не удалось загрузить данные пользователя. Попробуйте обновить страницу." />
        ) : user ? (
          <div className="space-y-4">
            <Card title="Пользователь">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Email" value={user.email ?? '—'} />
                <Field label="Телефон" value={user.phone ?? '—'} />
                <Field label="Роль" value={getRoleLabel(user.role)} />
                <Field label="Статус" value={<UserStatusBadge status={user.status} />} />
                <Field label="Федерация" value={user.federation?.name ?? '—'} />
                <Field label="ФИО" value={user.person ? formatPersonName(user.person) : '—'} />
                <Field label="Создан" value={formatDateTime(user.created_at)} />
                <Field label="ID" value={<span className="font-mono text-xs">{user.id}</span>} />
              </div>
            </Card>

            {user.role === 'admin' ? <InsuranceAccessCard user={user} onSaved={() => load()} /> : null}

            {!managed ? (
              <p className="text-sm text-muted-foreground">
                Этот аккаунт управляется в разделе «Спортсмены».
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}
