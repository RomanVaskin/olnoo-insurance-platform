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
    throw new ApiError(res.status)
  }

  return res.json()
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message?: string) {
    super(message || `Request failed with status ${status}`)
    this.status = status
  }
}

async function apiErrorFromResponse(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return new ApiError(res.status, body.message || body.error)
  } catch {
    return new ApiError(res.status)
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
  amount_kopecks: number | null
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

// Applications management — product change is the only directly-editable field
// (person/federation/amount are always server-derived); status changes go through
// the explicit cancel/reopen actions instead of arbitrary status editing.
export async function updateApplicationProduct(id: string, productId: string): Promise<ApplicationDetail> {
  const res = await fetch(`/api/applications/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId }),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function cancelApplication(id: string): Promise<ApplicationDetail> {
  const res = await fetch(`/api/applications/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function reopenApplication(id: string): Promise<ApplicationDetail> {
  const res = await fetch(`/api/applications/${id}/reopen`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
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
  amount_kopecks: number | null
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

// Policy management — policy_number is the only directly-editable field; status
// changes go through the explicit cancel/reactivate/expire actions.
export async function updatePolicyNumber(id: string, policyNumber: string): Promise<PolicyDetail> {
  const res = await fetch(`/api/policies/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy_number: policyNumber }),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function cancelPolicy(id: string): Promise<PolicyDetail> {
  const res = await fetch(`/api/policies/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function reactivatePolicy(id: string): Promise<PolicyDetail> {
  const res = await fetch(`/api/policies/${id}/reactivate`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function expirePolicy(id: string): Promise<PolicyDetail> {
  const res = await fetch(`/api/policies/${id}/expire`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function generatePolicyPdf(id: string): Promise<{ policy_id: string; insurer: string; policy_url: string }> {
  const res = await fetch(`/api/policies/${id}/generate-pdf`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
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

// Shape returned by POST/PATCH /api/athletes — same person + membership shapes as
// AthleteDetail, minus applications/payments/policies (which don't apply to a write).
export type AthleteWriteResult = {
  person: AthletePerson
  federation_memberships: AthleteFederationMembership[]
}

export type AthleteInput = {
  last_name: string
  first_name: string
  patronymic: string | null
  birthdate: string | null
  gender: string | null
  phone: string | null
  email: string | null
  federation_id?: string
  club?: string | null
  coach?: string | null
  grade?: string | null
  weight?: number | null
  sport_name?: string | null
  membership_status?: string
}

export async function createAthlete(input: AthleteInput): Promise<AthleteWriteResult> {
  const res = await fetch('/api/athletes', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function updateAthlete(id: string, input: Partial<AthleteInput>): Promise<AthleteWriteResult> {
  const res = await fetch(`/api/athletes/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
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

// Shape returned by POST/PATCH /api/federations — narrower than the list/detail
// shapes above, which also carry derived counts the write endpoints don't compute.
export type FederationRecord = {
  id: string
  name: string
  slug: string
  status: string
}

export type FederationInput = {
  name: string
  slug: string
  status: string
}

export async function createFederation(input: FederationInput): Promise<FederationRecord> {
  const res = await fetch('/api/federations', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function updateFederation(id: string, input: FederationInput): Promise<FederationRecord> {
  const res = await fetch(`/api/federations/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export type Payment = {
  id: string
  application_id: string
  provider: string
  provider_payment_id: string
  amount_kopecks: number
  currency: string
  status: string
  paid_at: string | null
  created_at: string
  person: PersonSummary
  federation: FederationSummary
  product: ProductSummary
  policy_number: string | null
}

export type PaymentApplicationSummary = {
  id: string
  status: ApplicationStatus
  amount_kopecks: number
  created_at: string
}

export type PaymentDetail = Payment & {
  application: PaymentApplicationSummary | null
  policy: PolicySummary | null
}

export async function fetchPayments(): Promise<Payment[]> {
  const res = await fetch('/api/payments', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export async function fetchPayment(id: string): Promise<PaymentDetail> {
  const res = await fetch(`/api/payments/${id}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export type Product = {
  id: string
  name: string
  category: string
  insurer_name: string | null
  coverage_amount_kopecks: number | null
  validity_days: number
  base_price_kopecks: number
  status: string
}

export type ProductFederationAssignment = {
  id: string
  federation: { id: string; name: string }
  price_kopecks: number
  active: boolean
}

export type ProductDetail = Product & {
  federation_assignments: ProductFederationAssignment[]
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch('/api/products', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export async function fetchProduct(id: string): Promise<ProductDetail> {
  const res = await fetch(`/api/products/${id}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export type ProductInput = {
  name: string
  category: string
  insurer_name: string | null
  coverage_amount_kopecks: number | null
  validity_days: number
  base_price_kopecks: number
  status: string
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const res = await fetch('/api/products', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  const res = await fetch(`/api/products/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function assignProductToFederation(
  productId: string,
  input: { federation_id: string; price_kopecks: number; active?: boolean },
): Promise<ProductFederationAssignment> {
  const res = await fetch(`/api/products/${productId}/federations`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function updateProductFederationAssignment(
  productId: string,
  federationId: string,
  input: { price_kopecks?: number; active?: boolean },
): Promise<ProductFederationAssignment> {
  const res = await fetch(`/api/products/${productId}/federations/${federationId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function removeProductFederationAssignment(
  productId: string,
  federationId: string,
): Promise<ProductFederationAssignment> {
  const res = await fetch(`/api/products/${productId}/federations/${federationId}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

// Users & Roles — manages platform staff accounts (super_admin, admin,
// federation_secretary, federation_director) only. Athlete/guardian accounts are never
// created or edited here; see Athletes CRUD (fetchAthletes/fetchAthlete) for those.
export type UserPersonSummary = {
  id: string
  last_name: string
  first_name: string
  patronymic: string | null
}

export type UserFederationAssignment = {
  id: string
  name: string
  role: string
} | null

// 'Доступ к видам страхования' in the UI — never call this "scope" in user-facing text.
export type InsuranceAccessGrant = {
  insurance_type: string
  permission: 'read' | 'manage'
}

export type PlatformUser = {
  id: string
  email: string | null
  phone: string | null
  role: string
  status: string
  person: UserPersonSummary | null
  federation: UserFederationAssignment
  insurance_access: InsuranceAccessGrant[]
  created_at: string
  updated_at: string
}

export async function fetchUsers(): Promise<PlatformUser[]> {
  const res = await fetch('/api/users', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export async function fetchUser(id: string): Promise<PlatformUser> {
  const res = await fetch(`/api/users/${id}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export type CreateUserInput = {
  email: string
  phone?: string | null
  role: string
  password: string
  federation_id?: string
  /** Required (>=1 entry) when role === 'admin'. */
  insurance_access?: InsuranceAccessGrant[]
}

export async function createUser(input: CreateUserInput): Promise<PlatformUser> {
  const res = await fetch('/api/users', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export type UpdateUserInput = {
  email?: string
  phone?: string | null
  status?: string
  role?: string
  federation_id?: string
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<PlatformUser> {
  const res = await fetch(`/api/users/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function resetUserPassword(id: string, password: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/users/${id}/reset-password`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

// 'Доступ к видам страхования' management for role === 'admin' users only.
export async function grantUserInsuranceAccess(
  id: string,
  grant: InsuranceAccessGrant,
): Promise<PlatformUser> {
  const res = await fetch(`/api/users/${id}/insurance-access`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(grant),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function updateUserInsuranceAccess(
  id: string,
  insuranceType: string,
  permission: 'read' | 'manage',
): Promise<PlatformUser> {
  const res = await fetch(`/api/users/${id}/insurance-access/${insuranceType}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission }),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function revokeUserInsuranceAccess(id: string, insuranceType: string): Promise<PlatformUser> {
  const res = await fetch(`/api/users/${id}/insurance-access/${insuranceType}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export type DocumentType = 'passport' | 'birth_certificate'

export type OcrExtractedData = {
  documentType: string
  lastName: string
  firstName: string
  middleName: string
  birthDate: string
  birthPlace: string
  gender: string
  passportSeries: string
  passportNumber: string
  issueDate: string
  issuedBy: string
  departmentCode: string
}

export type DocumentRecord = {
  id: string
  person_id: string
  application_id: string | null
  type: string
  status: string
  extracted_data: OcrExtractedData | null
  created_at: string
}

export type PaymentSettings = {
  provider: string
  configured: boolean
  shop_id_masked: string | null
  secret_key_configured: boolean
  mode: string
  webhook_configured: boolean
}

export type PaymentSettingsTestResult =
  | { ok: true; account_id: string | null; test_mode: boolean | null }
  | { ok: false; reason: string }

export async function fetchPaymentSettings(): Promise<PaymentSettings> {
  const res = await fetch('/api/settings/payments', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export async function testPaymentSettings(): Promise<PaymentSettingsTestResult> {
  const res = await fetch('/api/settings/payments/test', {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

// Payment profiles (payment_accounts) — super_admin only. Secret values are never
// returned by the backend; only `secret_configured` and a masked shop id.
export type PaymentAccount = {
  id: string
  provider: string
  name: string
  shop_id_masked: string
  secret_configured: boolean
  status: string
  created_at: string
  updated_at: string
}

export async function fetchPaymentAccounts(): Promise<PaymentAccount[]> {
  const res = await fetch('/api/settings/payment-accounts', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export type CreatePaymentAccountInput = {
  provider: 'yookassa'
  name: string
  shop_id: string
  secret_key?: string
  status?: string
}

export async function createPaymentAccount(input: CreatePaymentAccountInput): Promise<PaymentAccount> {
  const res = await fetch('/api/settings/payment-accounts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export type UpdatePaymentAccountInput = {
  name?: string
  shop_id?: string
  secret_key?: string
  status?: string
}

export async function updatePaymentAccount(
  id: string,
  input: UpdatePaymentAccountInput,
): Promise<PaymentAccount> {
  const res = await fetch(`/api/settings/payment-accounts/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

// Payment routing (payment_routing) — precedence product > federation > insurance_type
// > default, purely from which target the rule names. super_admin only.
export type PaymentRoutingTarget =
  | { level: 'product'; product: { id: string; name: string } }
  | { level: 'federation'; federation: { id: string; name: string } }
  | { level: 'insurance_type'; insurance_type: string }
  | { level: 'default' }

export type PaymentRoutingRule = {
  id: string
  payment_account: { id: string; name: string }
  target: PaymentRoutingTarget
  created_at: string
}

export async function fetchPaymentRouting(): Promise<PaymentRoutingRule[]> {
  const res = await fetch('/api/settings/payment-routing', {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  return res.json()
}

export type CreatePaymentRoutingInput = {
  payment_account_id: string
  insurance_type?: string
  federation_id?: string
  product_id?: string
}

export async function createPaymentRouting(input: CreatePaymentRoutingInput): Promise<{ id: string }> {
  const res = await fetch('/api/settings/payment-routing', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function deletePaymentRouting(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/settings/payment-routing/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function recognizeDocument(file: File): Promise<OcrExtractedData> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch('/api/documents/recognize', {
    method: 'POST',
    credentials: 'include',
    body: form,
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  const body = (await res.json()) as { data: OcrExtractedData }
  return body.data
}

export async function createDocument(params: {
  file: File
  type: DocumentType
  personId: string
  applicationId?: string | null
  extractedData?: OcrExtractedData | null
}): Promise<DocumentRecord> {
  const form = new FormData()
  form.append('file', params.file)
  form.append('type', params.type)
  form.append('person_id', params.personId)
  if (params.applicationId) {
    form.append('application_id', params.applicationId)
  }
  if (params.extractedData) {
    form.append('extracted_data', JSON.stringify(params.extractedData))
  }

  const res = await fetch('/api/documents', {
    method: 'POST',
    credentials: 'include',
    body: form,
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

// Excel Import Center — mass data import for super_admin (see src/routes/imports.ts).
export type ImportType = 'federations' | 'athletes' | 'products' | 'assignments'

export type ImportRowResult = {
  row_number: number
  action: 'create' | 'update' | 'skip'
  matched_id: string | null
  data: Record<string, unknown> | null
  /** Original raw cell values for this row — send this (not `data`) back on commit. */
  raw: Record<string, unknown>
  errors: string[]
  warnings: string[]
}

export type ImportPreviewResult = {
  import_type: ImportType
  total_rows: number
  valid_rows: number
  invalid_rows: number
  rows: ImportRowResult[]
}

export type ImportCommitResult = {
  import_type: ImportType
  created: number
  updated: number
  skipped: number
  errors: { row_number: number; errors: string[] }[]
}

export async function downloadImportTemplate(type: ImportType): Promise<void> {
  const res = await fetch(`/api/imports/template/${type}`, {
    credentials: 'include',
  })

  if (!res.ok) {
    throw new ApiError(res.status)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${type}_template.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function previewImport(type: ImportType, file: File): Promise<ImportPreviewResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('type', type)

  const res = await fetch('/api/imports/preview', {
    method: 'POST',
    credentials: 'include',
    body: form,
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}

export async function commitImport(
  type: ImportType,
  rows: { row_number: number; raw: Record<string, unknown> }[],
): Promise<ImportCommitResult> {
  const res = await fetch('/api/imports/commit', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, rows }),
  })

  if (!res.ok) {
    throw await apiErrorFromResponse(res)
  }

  return res.json()
}
