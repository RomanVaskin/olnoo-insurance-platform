'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { login } from '@/lib/auth'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(false)

    const result = await login(email, password)

    if (result.ok) {
      router.replace('/dashboard')
      return
    }

    setError(true)
    setSubmitting(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandLogo height={24} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border bg-card px-6 py-8"
        >
          <h1 className="mb-6 text-lg font-semibold tracking-tight">Вход в панель</h1>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium">Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>

          {error && (
            <p className="mt-4 text-sm text-destructive">Неверный email или пароль</p>
          )}

          <Button type="submit" size="lg" disabled={submitting} className="mt-6 w-full">
            {submitting ? 'Вход…' : 'Войти'}
          </Button>
        </form>
      </div>
    </div>
  )
}
