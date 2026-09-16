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
