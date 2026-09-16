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

export type PolicyStatus = 'active' | 'cancelled' | 'expired'

export type Policy = {
  id: string
  policy_number: string
  status: PolicyStatus
  valid_from: string
  valid_to: string
  policy_url: string | null
  person: PersonSummary
  federation: FederationSummary
  product: ProductSummary
}

export type PolicyApplicationSummary = {
  id: string
  status: ApplicationStatus
  amount_kopecks: number
  created_at: string
}

export type PolicyDetail = Policy & {
  application: PolicyApplicationSummary | null
  payment: PaymentSummary | null
}

export async function fetchPolicies(): Promise<Policy[]> {
  const res = await fetch('/api/policies', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export async function fetchPolicy(id: string): Promise<PolicyDetail> {
  const res = await fetch(`/api/policies/${id}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export type Athlete = {
  id: string
  last_name: string
  first_name: string
  patronymic: string | null
  birthdate: string
  gender: string | null
  phone: string | null
  email: string | null
  federation: FederationSummary
  club: string | null
  coach: string | null
  grade: string | null
  weight: number | null
  sport_name: string | null
  insured: boolean
  active_policy_number: string | null
}

export type AthletePerson = {
  id: string
  last_name: string
  first_name: string
  patronymic: string | null
  birthdate: string
  gender: string | null
  phone: string | null
  email: string | null
}

export type AthleteFederationMembership = {
  federation: FederationSummary
  club: string | null
  coach: string | null
  grade: string | null
  weight: number | null
  sport_name: string | null
  status: string
}

export type AthletePayment = PaymentSummary & {
  application_id: string
}

export type AthletePolicy = {
  id: string
  policy_number: string
  status: string
  valid_from: string
  valid_to: string
  policy_url: string | null
  product: ProductSummary
}

export type AthleteApplication = {
  id: string
  status: ApplicationStatus
  amount_kopecks: number
  created_at: string
  federation: FederationSummary
  product: ProductSummary
}

export type AthleteDetail = {
  person: AthletePerson
  federation_memberships: AthleteFederationMembership[]
  applications: AthleteApplication[]
  payments: AthletePayment[]
  policies: AthletePolicy[]
}

export async function fetchAthletes(): Promise<Athlete[]> {
  const res = await fetch('/api/athletes', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export async function fetchAthlete(id: string): Promise<AthleteDetail> {
  const res = await fetch(`/api/athletes/${id}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export type Federation = {
  id: string
  name: string
  slug: string
  status: string
  athlete_count: number
  policy_count?: number
  paid_amount_kopecks?: number
}

export type FederationAssignedUser = {
  id: string
  email: string | null
  role: string
}

export type FederationAthlete = {
  id: string
  last_name: string
  first_name: string
  patronymic: string | null
  club: string | null
  coach: string | null
  grade: string | null
  weight: number | null
  sport_name: string | null
  insured: boolean
  active_policy_number: string | null
}

export type FederationAssignedProduct = {
  id: string
  product: { id: string; name: string; category: string }
  price_kopecks: number
  active: boolean
}

export type FederationDetail = {
  federation: { id: string; name: string; slug: string; status: string }
  assigned_users: FederationAssignedUser[]
  athlete_count: number
  athletes: FederationAthlete[]
  assigned_products: FederationAssignedProduct[]
  application_count?: number
  policy_count?: number
  paid_amount_kopecks?: number
}

export async function fetchFederations(): Promise<Federation[]> {
  const res = await fetch('/api/federations', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export async function fetchFederation(id: string): Promise<FederationDetail> {
  const res = await fetch(`/api/federations/${id}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}
