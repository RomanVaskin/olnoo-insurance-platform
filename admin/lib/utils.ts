import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

export function formatKopecks(kopecks: number) {
  return rubFormatter.format(kopecks / 100)
}

export function formatPersonName(person: { last_name: string; first_name: string; patronymic: string | null }) {
  return [person.last_name, person.first_name, person.patronymic].filter(Boolean).join(' ')
}

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}
