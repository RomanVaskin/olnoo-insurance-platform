'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckCircle2,
  ExternalLink,
  FileScan,
  Loader2,
  RotateCcw,
  UploadCloud,
} from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { StatePanel } from '@/components/applications/state-panel'
import {
  ApiError,
  createDocument,
  fetchDocuments,
  recognizeDocument,
  type DocumentRecord,
  type DocumentType,
  type OcrExtractedData,
} from '@/lib/api'
import { formatDateTime, formatPersonName } from '@/lib/utils'

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const documentTypes: { value: DocumentType; label: string }[] = [
  { value: 'passport', label: 'Паспорт' },
  { value: 'birth_certificate', label: 'Свидетельство о рождении' },
  { value: 'other', label: 'Другой' },
]

const extractedFields: { key: keyof OcrExtractedData; label: string }[] = [
  { key: 'lastName', label: 'Фамилия' },
  { key: 'firstName', label: 'Имя' },
  { key: 'middleName', label: 'Отчество' },
  { key: 'birthDate', label: 'Дата рождения' },
  { key: 'birthPlace', label: 'Место рождения' },
  { key: 'gender', label: 'Пол' },
  { key: 'passportSeries', label: 'Серия паспорта' },
  { key: 'passportNumber', label: 'Номер паспорта' },
  { key: 'issueDate', label: 'Дата выдачи' },
  { key: 'issuedBy', label: 'Кем выдан' },
  { key: 'departmentCode', label: 'Код подразделения' },
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Step = 'form' | 'recognizing' | 'review' | 'saving' | 'done'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

export default function DocumentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [docType, setDocType] = useState<DocumentType>('passport')
  const [file, setFile] = useState<File | null>(null)
  const [personId, setPersonId] = useState(searchParams.get('person_id') ?? '')
  const [applicationId, setApplicationId] = useState(searchParams.get('application_id') ?? '')

  const [step, setStep] = useState<Step>('form')
  const [extracted, setExtracted] = useState<OcrExtractedData | null>(null)
  const [recognizeError, setRecognizeError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedDoc, setSavedDoc] = useState<DocumentRecord | null>(null)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [listError, setListError] = useState(false)
  const [filter, setFilter] = useState<DocumentType | ''>('')

  const personIdValid = UUID_RE.test(personId.trim())
  const applicationIdValid = applicationId.trim() === '' || UUID_RE.test(applicationId.trim())

  const canRecognize = useMemo(
    () => file !== null && personIdValid && applicationIdValid && step === 'form',
    [file, personIdValid, applicationIdValid, step],
  )

  useEffect(() => {
    let cancelled = false
    fetchDocuments(filter || undefined)
      .then((result) => {
        if (!cancelled) {
          setDocuments(result)
          setListError(false)
        }
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) router.replace('/login')
        else setListError(true)
      })
    return () => { cancelled = true }
  }, [filter, router, savedDoc])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null)
    setRecognizeError(null)
  }

  async function handleRecognize() {
    if (!file) return

    setStep('recognizing')
    setRecognizeError(null)

    try {
      const data = await recognizeDocument(file, personId.trim(), applicationId.trim() || null)
      setExtracted(data)
      setStep('review')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login')
        return
      }
      setRecognizeError(
        err instanceof ApiError ? err.message : 'Не удалось распознать документ. Попробуйте ещё раз.',
      )
      setStep('form')
    }
  }

  function handleFieldChange(key: keyof OcrExtractedData, value: string) {
    setExtracted((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleSave() {
    if (!file || !personIdValid || !applicationIdValid) return

    setStep('saving')
    setSaveError(null)

    try {
      const doc = await createDocument({
        file,
        type: docType,
        personId: personId.trim(),
        applicationId: applicationId.trim() || null,
        extractedData: extracted,
      })
      setSavedDoc(doc)
      setStep('done')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login')
        return
      }
      setSaveError(
        err instanceof ApiError ? err.message : 'Не удалось сохранить документ. Попробуйте ещё раз.',
      )
      setStep('review')
    }
  }

  function handleReset() {
    setDocType('passport')
    setFile(null)
    setPersonId('')
    setApplicationId('')
    setStep('form')
    setExtracted(null)
    setRecognizeError(null)
    setSaveError(null)
    setSavedDoc(null)
  }

  return (
    <>
      <PageHeader
        title="Документы"
        description="Загрузка и распознавание документов (паспорт, свидетельство о рождении) с привязкой к персоне"
      />

      <div className="px-6 py-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="max-w-2xl space-y-6">
            {/* Upload card */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Документ
              </h2>
              <div className="mt-4 space-y-5">
                <Field label="Тип документа">
                  <div className="grid grid-cols-2 gap-2">
                    {documentTypes.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        disabled={step !== 'form'}
                        onClick={() => setDocType(t.value)}
                        className={`h-9 rounded-lg border text-sm transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                          docType === t.value
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-background hover:bg-muted'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Файл">
                  <label
                    className={`flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 ${
                      step !== 'form' ? 'pointer-events-none opacity-50' : ''
                    }`}
                  >
                    <UploadCloud className="size-5" />
                    <span className="max-w-[90%] truncate">
                      {file ? file.name : 'Выберите скан или фото документа'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={step !== 'form'}
                    />
                  </label>
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="ID персоны">
                    <input
                      type="text"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={personId}
                      onChange={(e) => setPersonId(e.target.value)}
                      disabled={step !== 'form'}
                      aria-invalid={personId.length > 0 && !personIdValid}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="ID заявки (опционально)">
                    <input
                      type="text"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={applicationId}
                      onChange={(e) => setApplicationId(e.target.value)}
                      disabled={step !== 'form'}
                      aria-invalid={applicationId.length > 0 && !applicationIdValid}
                      className={inputClass}
                    />
                  </Field>
                </div>
                {personId.length > 0 && !personIdValid && (
                  <p className="text-sm text-destructive">Некорректный формат ID персоны.</p>
                )}
                {applicationId.length > 0 && !applicationIdValid && (
                  <p className="text-sm text-destructive">Некорректный формат ID заявки.</p>
                )}

                {recognizeError && <p className="text-sm text-destructive">{recognizeError}</p>}

                {(step === 'form' || step === 'recognizing') && (
                  <Button
                    type="button"
                    size="lg"
                    disabled={!canRecognize || step === 'recognizing'}
                    onClick={handleRecognize}
                    className="w-full"
                  >
                    {step === 'recognizing' ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Распознавание…
                      </>
                    ) : (
                      <>
                        <FileScan className="size-4" />
                        Распознать документ
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Review card */}
            {(step === 'review' || step === 'saving' || step === 'done') && extracted && (
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Распознанные данные
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Проверьте и при необходимости исправьте поля перед сохранением.
                </p>

                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  {extractedFields.map((f) => (
                    <Field key={f.key} label={f.label}>
                      <input
                        type="text"
                        value={extracted[f.key] ?? ''}
                        onChange={(e) => handleFieldChange(f.key, e.target.value)}
                        disabled={step !== 'review'}
                        className={inputClass}
                      />
                    </Field>
                  ))}
                </div>

                {saveError && <p className="mt-4 text-sm text-destructive">{saveError}</p>}

                {step !== 'done' && (
                  <Button
                    type="button"
                    size="lg"
                    disabled={!personIdValid || !applicationIdValid || step === 'saving'}
                    onClick={handleSave}
                    className="mt-6 w-full"
                  >
                    {step === 'saving' ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Сохранение…
                      </>
                    ) : (
                      'Сохранить документ'
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Result / status panel */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            {step === 'done' && savedDoc ? (
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
                  <CheckCircle2 className="size-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">Документ сохранён</h3>
                <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{savedDoc.id}</p>
                <div className="mt-5 flex flex-col gap-2">
                  <a href={`/api/documents/${savedDoc.id}/file`} target="_blank" rel="noreferrer">
                    <Button size="lg" variant="outline" className="w-full">
                      <ExternalLink className="size-4" />
                      Открыть файл
                    </Button>
                  </a>
                  <Button size="lg" onClick={handleReset} className="w-full">
                    <RotateCcw className="size-4" />
                    Загрузить ещё один документ
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                  <FileScan className="size-5" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground text-pretty">
                  {step === 'form' &&
                    'Выберите тип документа и файл, затем запустите распознавание.'}
                  {step === 'recognizing' && 'Идёт распознавание документа…'}
                  {step === 'review' &&
                    'Проверьте распознанные данные, укажите ID персоны и сохраните документ.'}
                  {step === 'saving' && 'Сохранение документа…'}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Загруженные документы</h2>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as DocumentType | '')}
              className={`${inputClass} w-auto min-w-56`}
              aria-label="Фильтр по типу документа"
            >
              <option value="">Все типы</option>
              {documentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          {listError ? (
            <StatePanel icon={FileScan} message="Не удалось загрузить список документов." />
          ) : documents.length === 0 ? (
            <StatePanel icon={FileScan} message="Документы не найдены." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {['Тип', 'Владелец', 'Заявка', 'OCR', 'Загружен'].map((heading) => (
                        <th key={heading} className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((document) => (
                      <tr
                        key={document.id}
                        onClick={() => router.push(`/documents/${document.id}`)}
                        className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                      >
                        <td className="px-4 py-3">{documentTypes.find((type) => type.value === document.type)?.label ?? document.type}</td>
                        <td className="px-4 py-3">{document.person ? formatPersonName(document.person) : '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{document.application?.id ?? '—'}</td>
                        <td className="px-4 py-3">{document.extracted_data ? 'Распознан' : 'Нет данных'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(document.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
