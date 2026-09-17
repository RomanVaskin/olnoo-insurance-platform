'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  ApiError,
  createAthlete,
  updateAthlete,
  type AthleteDetail,
  type AthleteInput,
  type AthleteWriteResult,
  type Federation,
} from '@/lib/api'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

// Mirrors the error codes the backend returns for POST/PATCH /api/athletes
// (see src/routes/athletes.ts).
const ERROR_MESSAGES: Record<string, string> = {
  last_name_required: 'Укажите фамилию.',
  first_name_required: 'Укажите имя.',
  invalid_patronymic: 'Некорректное отчество.',
  invalid_birthdate: 'Некорректная дата рождения.',
  invalid_gender: 'Недопустимое значение пола.',
  invalid_phone: 'Некорректный телефон.',
  invalid_email: 'Некорректный email.',
  federation_id_required: 'Выберите федерацию.',
  invalid_federation_id: 'Выберите федерацию из списка.',
  federation_not_found: 'Федерация не найдена.',
  invalid_club: 'Некорректный клуб.',
  invalid_coach: 'Некорректный тренер.',
  invalid_grade: 'Некорректный разряд.',
  invalid_weight: 'Вес должен быть неотрицательным числом.',
  invalid_sport_name: 'Некорректный вид спорта.',
  invalid_membership_status: 'Недопустимый статус членства.',
  no_fields_to_update: 'Нет изменений для сохранения.',
  federation_change_not_supported:
    'Смена федерации для уже существующего членства пока не поддерживается — это привело бы к потере истории (клуб, тренер, разряд). Обратитесь к разработчику.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message && ERROR_MESSAGES[err.message]) {
    return ERROR_MESSAGES[err.message]
  }
  return 'Не удалось сохранить спортсмена. Попробуйте ещё раз.'
}

export function AthleteFormDialog({
  open,
  onOpenChange,
  federations,
  athlete,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Federations available to pick from when the athlete has no membership yet. */
  federations: Federation[]
  /** Present in edit mode, pre-populates the form; absent (or null) creates a new athlete. */
  athlete?: AthleteDetail | null
  onSaved: (result: AthleteWriteResult) => void
}) {
  const isEdit = Boolean(athlete)
  const existingMembership = athlete?.federation_memberships[0] ?? null

  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [gender, setGender] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [federationId, setFederationId] = useState('')
  const [club, setClub] = useState('')
  const [coach, setCoach] = useState('')
  const [grade, setGrade] = useState('')
  const [weight, setWeight] = useState('')
  const [sportName, setSportName] = useState('')
  const [membershipStatus, setMembershipStatus] = useState('active')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLastName(athlete?.person.last_name ?? '')
      setFirstName(athlete?.person.first_name ?? '')
      setPatronymic(athlete?.person.patronymic ?? '')
      setBirthdate(athlete?.person.birthdate ?? '')
      setGender(athlete?.person.gender ?? '')
      setPhone(athlete?.person.phone ?? '')
      setEmail(athlete?.person.email ?? '')
      setFederationId(existingMembership?.federation?.id ?? '')
      setClub(existingMembership?.club ?? '')
      setCoach(existingMembership?.coach ?? '')
      setGrade(existingMembership?.grade ?? '')
      setWeight(existingMembership?.weight !== null && existingMembership?.weight !== undefined ? String(existingMembership.weight) : '')
      setSportName(existingMembership?.sport_name ?? '')
      setMembershipStatus(existingMembership?.status ?? 'active')
      setError(null)
      setSubmitting(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, athlete])

  const membershipLocked = isEdit && Boolean(existingMembership)
  const hasFederationSelected = federationId !== ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    let weightNum: number | null = null
    if (weight.trim() !== '') {
      const parsed = Number(weight)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Укажите корректный вес.')
        setSubmitting(false)
        return
      }
      weightNum = parsed
    }

    const input: AthleteInput = {
      last_name: lastName.trim(),
      first_name: firstName.trim(),
      patronymic: patronymic.trim() === '' ? null : patronymic.trim(),
      birthdate: birthdate === '' ? null : birthdate,
      gender: gender === '' ? null : gender,
      phone: phone.trim() === '' ? null : phone.trim(),
      email: email.trim() === '' ? null : email.trim(),
    }

    // Membership fields are only sent when a federation is selected (create, or
    // first-time assignment on edit) — never when editing an already-linked
    // federation, where federation_id is intentionally omitted from the request.
    if (!membershipLocked && hasFederationSelected) {
      input.federation_id = federationId
    }
    if ((!membershipLocked && hasFederationSelected) || membershipLocked) {
      input.club = club.trim() === '' ? null : club.trim()
      input.coach = coach.trim() === '' ? null : coach.trim()
      input.grade = grade.trim() === '' ? null : grade.trim()
      input.weight = weightNum
      input.sport_name = sportName.trim() === '' ? null : sportName.trim()
      input.membership_status = membershipStatus
    }

    try {
      const saved = isEdit && athlete ? await updateAthlete(athlete.person.id, input) : await createAthlete(input)
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={isEdit ? 'Редактировать спортсмена' : 'Создать спортсмена'}>
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Фамилия</span>
            <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Имя</span>
            <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Отчество</span>
          <input type="text" value={patronymic} onChange={(e) => setPatronymic(e.target.value)} className={inputClass} placeholder="Необязательно" />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Дата рождения</span>
            <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Пол</span>
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputClass}>
              <option value="">Не указан</option>
              <option value="male">Мужской</option>
              <option value="female">Женский</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Телефон</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="Необязательно" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Необязательно" />
          </label>
        </div>

        <div className="border-t border-border pt-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Федерация</span>
            {membershipLocked ? (
              <input type="text" disabled value={existingMembership?.federation?.name ?? ''} className={inputClass} />
            ) : (
              <select value={federationId} onChange={(e) => setFederationId(e.target.value)} className={inputClass}>
                <option value="">Без федерации</option>
                {federations.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            {membershipLocked ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Смена федерации не поддерживается из этой формы.
              </p>
            ) : null}
          </label>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Клуб</span>
              <input
                type="text"
                disabled={!membershipLocked && !hasFederationSelected}
                value={club}
                onChange={(e) => setClub(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Тренер</span>
              <input
                type="text"
                disabled={!membershipLocked && !hasFederationSelected}
                value={coach}
                onChange={(e) => setCoach(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Разряд</span>
              <input
                type="text"
                disabled={!membershipLocked && !hasFederationSelected}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Вес, кг</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={!membershipLocked && !hasFederationSelected}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Вид спорта</span>
              <input
                type="text"
                disabled={!membershipLocked && !hasFederationSelected}
                value={sportName}
                onChange={(e) => setSportName(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Статус членства</span>
              <select
                disabled={!membershipLocked && !hasFederationSelected}
                value={membershipStatus}
                onChange={(e) => setMembershipStatus(e.target.value)}
                className={inputClass}
              >
                <option value="active">Активен</option>
                <option value="inactive">Неактивен</option>
              </select>
            </label>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
