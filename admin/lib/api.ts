export type DashboardData = {
  total_federations: number
  total_athletes: number
  total_applications: number
  total_policies: number
  active_policies: number
  paid_amount_kopecks?: number
}

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch('/api/dashboard', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`Dashboard request failed with status ${res.status}`)
  }

  return res.json()
}

export class ApiError extends Error {
  status: number

  constructor(status: number) {
    super(`Request failed with status ${status}`)
    this.status = status
  }
}

export type ApplicationStatus = 'draft' | 'pending_payment' | 'paid' | 'policy_issued' | 'cancelled'

export type PersonSummary = {
  id: string
  last_name: string
  first_name: string
  patronymic: string | null
}

export type FederationSummary = {
  id: string
  name: string
} | null

export type ProductSummary = {
  id: string
  name: string
}

export type PaymentSummary = {
  id: string
  provider: string
  provider_payment_id: string
  amount_kopecks: number
  currency: string
  status: string
  paid_at: string | null
  created_at: string
}

export type PolicySummary = {
  id: string
  policy_number: string
  status: string
  valid_from: string
  valid_to: string
  policy_url: string | null
}

export type Application = {
  id: string
  status: ApplicationStatus
  amount_kopecks: number
  created_at: string
  person: PersonSummary
  federation: FederationSummary
  product: ProductSummary
}

export type ApplicationDetail = Application & {
  payment: PaymentSummary | null
  policy: PolicySummary | null
}

export async function fetchApplications(): Promise<Application[]> {
  const res = await fetch('/api/applications', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export async function fetchApplication(id: string): Promise<ApplicationDetail> {
  const res = await fetch(`/api/applications/${id}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}
