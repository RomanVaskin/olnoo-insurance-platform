import type { PolicyStatus } from '@/components/status-badge'

export type PolicyType = 'VK' | 'VI' | 'SYS'

export type Pool = {
  type: PolicyType
  insurer: string
  product: string
  free: number
  reserved: number
  issued: number
  configured: boolean
}

export type IssuedPolicy = {
  number: string
  type: PolicyType
  status: PolicyStatus
  insured: string
  tournament: string
  contractDate: string
  issueDate: string
}

export const kpis = [
  { label: 'Свободные номера', value: 184 },
  { label: 'Зарезервировано', value: 3 },
  { label: 'Выпущено', value: 67 },
  { label: 'Всего номеров', value: 254 },
]

export const pools: Pool[] = [
  {
    type: 'VK',
    insurer: 'Ингосстрах',
    product: 'Групповой полис',
    free: 120,
    reserved: 2,
    issued: 48,
    configured: true,
  },
  {
    type: 'VI',
    insurer: 'Ингосстрах',
    product: 'Индивидуальный полис',
    free: 64,
    reserved: 1,
    issued: 19,
    configured: true,
  },
  {
    type: 'SYS',
    insurer: 'РЕСО-Гарантия',
    product: 'Годовой индивидуальный',
    free: 0,
    reserved: 0,
    issued: 0,
    configured: false,
  },
]

export const issuedPolicies: IssuedPolicy[] = [
  {
    number: 'VK7377383',
    type: 'VK',
    status: 'Выпущен',
    insured: 'Иванов Иван Иванович',
    tournament: 'sport613',
    contractDate: '05.09.2026',
    issueDate: '05.09.2026',
  },
  {
    number: 'VK7377384',
    type: 'VK',
    status: 'Выпущен',
    insured: 'Петров Петр Сергеевич',
    tournament: 'sport614',
    contractDate: '06.09.2026',
    issueDate: '06.09.2026',
  },
  {
    number: 'VI5521090',
    type: 'VI',
    status: 'Выпущен',
    insured: 'Сидорова Анна Викторовна',
    tournament: 'sport615',
    contractDate: '06.09.2026',
    issueDate: '07.09.2026',
  },
  {
    number: 'VK7377385',
    type: 'VK',
    status: 'Зарезервирован',
    insured: 'Кузнецов Дмитрий Олегович',
    tournament: 'sport616',
    contractDate: '07.09.2026',
    issueDate: '—',
  },
  {
    number: 'VI5521091',
    type: 'VI',
    status: 'Выпущен',
    insured: 'Морозова Елена Андреевна',
    tournament: 'sport617',
    contractDate: '08.09.2026',
    issueDate: '08.09.2026',
  },
  {
    number: 'VK7377386',
    type: 'VK',
    status: 'Свободен',
    insured: '—',
    tournament: '—',
    contractDate: '—',
    issueDate: '—',
  },
]

export const tournaments = ['sport613', 'sport614', 'sport615', 'sport616', 'sport617']
