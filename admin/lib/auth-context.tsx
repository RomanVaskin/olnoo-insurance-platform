'use client'

import { createContext, useContext } from 'react'
import type { Account } from '@/lib/auth'

export const AccountContext = createContext<Account | null>(null)

export function useAccount(): Account | null {
  return useContext(AccountContext)
}
