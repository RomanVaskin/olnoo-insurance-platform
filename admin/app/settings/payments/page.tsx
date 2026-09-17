'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldX, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { StatePanel } from '@/components/applications/state-panel'
import {
  ApiError,
  fetchPaymentSettings,
  testPaymentSettings,
  type PaymentSettings,
  type PaymentSettingsTestResult,
} from '@/lib/api'
import { cn } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error'

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        ok ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

export default function Page() {
  const router = useRouter()
  const [settings, setSettings] = useState<PaymentSettings | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<PaymentSettingsTestResult | null>(null)

  useEffect(() => {
    let cancelled = false

    setState('loading')

    fetchPaymentSettings()
      .then((result) => {
        if (cancelled) return
        setSettings(result)
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
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [router])

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testPaymentSettings()
      setTestResult(result)
    } catch {
      setTestResult({ ok: false, reason: 'request_failed' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <PageHeader title="Платежи" description="Настройки платёжного провайдера" />
      <div className="px-6 py-8 lg:px-10">
        {state === 'loading' ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="space-y-px bg-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse bg-muted/30" />
              ))}
            </div>
          </div>
        ) : state === 'forbidden' ? (
          <StatePanel icon={ShieldX} message="Доступ к настройкам платежей ограничен для вашей роли." />
        ) : state === 'error' || !settings ? (
          <StatePanel icon={TriangleAlert} message="Не удалось загрузить настройки платежей. Попробуйте обновить страницу." />
        ) : (
          <div className="max-w-2xl space-y-6">
            <div className="overflow-hidden rounded-xl border border-border">
              <Row label="Провайдер">YooKassa</Row>
              <Row label="Статус подключения">
                <Badge ok={settings.configured} label={settings.configured ? 'Настроено' : 'Не настроено'} />
              </Row>
              <Row label="Shop ID">{settings.shop_id_masked ?? '—'}</Row>
              <Row label="Секретный ключ">
                <Badge
                  ok={settings.secret_key_configured}
                  label={settings.secret_key_configured ? 'Настроен' : 'Не настроен'}
                />
              </Row>
              <Row label="Режим">{settings.mode === 'live' ? 'Боевой' : 'Не настроен'}</Row>
              <Row label="Webhook">
                <Badge ok={settings.webhook_configured} label="Не настроен" />
              </Row>
            </div>

            <div className="rounded-xl border border-border p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">Проверка соединения</div>
                  <p className="mt-1 text-sm text-muted-foreground text-pretty">
                    Выполняет безопасный запрос к YooKassa без создания платежа.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {testing ? <Loader2 className="size-4 animate-spin" /> : null}
                  Проверить подключение
                </button>
              </div>

              {testResult ? (
                <div
                  className={cn(
                    'mt-4 rounded-lg border px-4 py-3 text-sm',
                    testResult.ok
                      ? 'border-border bg-muted/40 text-foreground'
                      : 'border-destructive/30 bg-destructive/5 text-destructive',
                  )}
                >
                  {testResult.ok
                    ? `Соединение установлено${testResult.account_id ? ` (account_id: ${testResult.account_id})` : ''}.`
                    : testResult.reason === 'not_configured'
                      ? 'YooKassa не настроена: заполните переменные окружения на сервере.'
                      : 'Не удалось подключиться к YooKassa. Проверьте учётные данные на сервере.'}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
