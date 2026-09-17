'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, FileQuestion, FileScan, Inbox, Loader2, ShieldX, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { StatePanel } from '@/components/applications/state-panel'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  ApiError,
  deleteDocument,
  fetchDocument,
  recognizeStoredDocument,
  updateDocument,
  type DocumentRecord,
  type DocumentType,
  type OcrExtractedData,
} from '@/lib/api'
import { formatDateTime, formatPersonName } from '@/lib/utils'

type LoadState = 'loading' | 'ready' | 'forbidden' | 'not_found' | 'error'

const documentTypes: { value: DocumentType; label: string }[] = [
  { value: 'passport', label: 'Паспорт' },
  { value: 'birth_certificate', label: 'Свидетельство о рождении' },
  { value: 'other', label: 'Другой' },
]

const extractedFields: { key: keyof OcrExtractedData; label: string }[] = [
  { key: 'documentType', label: 'Тип по OCR' },
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

const inputClass =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

const errorMessages: Record<string, string> = {
  document_historical: 'Документ участвует в заявке или истории полиса и защищён от изменений.',
  invalid_type: 'Выбран неподдерживаемый тип документа.',
  invalid_extracted_data: 'Некорректные распознанные данные.',
  ocr_recognition_failed: 'Не удалось распознать документ. Исходный файл сохранён без изменений.',
  document_file_not_found: 'Файл документа не найден в защищённом хранилище.',
  forbidden: 'Недостаточно прав для этого действия.',
}

function actionError(error: unknown): string {
  return error instanceof ApiError && errorMessages[error.message]
    ? errorMessages[error.message]
    : 'Не удалось выполнить действие. Попробуйте ещё раз.'
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-sm">{value}</div></div>
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [document, setDocument] = useState<DocumentRecord | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState<DocumentType>('passport')
  const [extracted, setExtracted] = useState<OcrExtractedData | null>(null)
  const [busy, setBusy] = useState<'save' | 'ocr' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    setState('loading')
    fetchDocument(params.id).then((result) => {
      if (cancelled) return
      setDocument(result)
      setType(result.type)
      setExtracted(result.extracted_data)
      setState('ready')
    }).catch((err) => {
      if (cancelled) return
      if (err instanceof ApiError && err.status === 401) router.replace('/login')
      else if (err instanceof ApiError && err.status === 403) setState('forbidden')
      else if (err instanceof ApiError && err.status === 404) setState('not_found')
      else setState('error')
    })
    return () => { cancelled = true }
  }, [params.id, router])

  useEffect(() => load(), [load])

  async function save() {
    if (!document || busy) return
    setBusy('save')
    setError(null)
    try {
      const updated = await updateDocument(document.id, { type, extracted_data: extracted })
      setDocument(updated)
      setEditing(false)
    } catch (err) {
      setError(actionError(err))
    } finally {
      setBusy(null)
    }
  }

  async function recognize() {
    if (!document || busy) return
    setBusy('ocr')
    setError(null)
    try {
      const updated = await recognizeStoredDocument(document.id)
      setDocument(updated)
      setExtracted(updated.extracted_data)
    } catch (err) {
      setError(actionError(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!document || busy) return
    setBusy('delete')
    setError(null)
    try {
      await deleteDocument(document.id)
      router.push('/documents')
    } catch (err) {
      setError(actionError(err))
      setDeleteOpen(false)
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Документ"
        description={document ? documentTypes.find((item) => item.value === document.type)?.label : undefined}
        action={<Button variant="outline" size="lg" onClick={() => router.push('/documents')}><ArrowLeft className="size-4" />К документам</Button>}
      />
      <div className="px-6 py-8 lg:px-10">
        {state === 'loading' ? <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/30" />
          : state === 'forbidden' ? <StatePanel icon={ShieldX} message="Доступ к документу ограничен для вашей роли." />
          : state === 'not_found' ? <StatePanel icon={FileQuestion} message="Документ не найден." />
          : state === 'error' ? <StatePanel icon={Inbox} message="Не удалось загрузить документ." />
          : document ? (
            <div className="space-y-4">
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Тип" value={documentTypes.find((item) => item.value === document.type)?.label ?? document.type} />
                  <Field label="Статус" value={document.status} />
                  <Field label="Загружен" value={formatDateTime(document.created_at)} />
                  <Field label="ID" value={<span className="font-mono text-xs">{document.id}</span>} />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <a href={`/api/documents/${document.id}/file`} target="_blank" rel="noreferrer"><Button variant="outline" size="lg"><Download className="size-4" />Скачать</Button></a>
                  {document.can_manage ? <Button variant="outline" size="lg" disabled={busy !== null} onClick={recognize}>{busy === 'ocr' ? <Loader2 className="size-4 animate-spin" /> : <FileScan className="size-4" />}Повторить OCR</Button> : null}
                  {document.can_manage ? <Button variant="outline" size="lg" disabled={busy !== null} onClick={() => setEditing((value) => !value)}>Редактировать</Button> : null}
                  {document.can_manage ? <Button variant="outline" size="lg" disabled={busy !== null} onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" />Удалить</Button> : null}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-5">
                  <h2 className="text-sm font-semibold">Владелец</h2>
                  <div className="mt-4 space-y-3">
                    <Field label="ФИО" value={document.person ? formatPersonName(document.person) : '—'} />
                    {document.person ? <Button variant="ghost" size="sm" onClick={() => router.push(`/athletes/${document.person!.id}`)}>Открыть спортсмена</Button> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <h2 className="text-sm font-semibold">Заявка</h2>
                  <div className="mt-4 space-y-3">
                    <Field label="Статус" value={document.application?.status ?? 'Не привязан'} />
                    {document.application ? <Button variant="ghost" size="sm" onClick={() => router.push(`/applications/${document.application!.id}`)}>Открыть заявку</Button> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <h2 className="text-sm font-semibold">Полис</h2>
                  <div className="mt-4 space-y-3">
                    <Field label="Номер" value={document.policy?.policy_number ?? 'Не выпущен'} />
                    {document.policy ? <Button variant="ghost" size="sm" onClick={() => router.push(`/policies/${document.policy!.id}`)}>Открыть полис</Button> : null}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="text-sm font-semibold">Распознанные данные</h2>
                {editing ? (
                  <div className="mt-4 space-y-5">
                    <label className="block"><span className="mb-2 block text-sm font-medium">Тип документа</span><select value={type} onChange={(e) => setType(e.target.value as DocumentType)} className={inputClass}>{documentTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {extractedFields.map((field) => <label key={field.key} className="block"><span className="mb-2 block text-sm font-medium">{field.label}</span><input className={inputClass} value={extracted?.[field.key] ?? ''} onChange={(e) => setExtracted((current) => ({ ...(current ?? {} as OcrExtractedData), [field.key]: e.target.value }))} /></label>)}
                    </div>
                    <div className="flex justify-end gap-2"><Button variant="outline" size="lg" onClick={() => { setEditing(false); setType(document.type); setExtracted(document.extracted_data) }}>Отмена</Button><Button size="lg" disabled={busy !== null} onClick={save}>{busy === 'save' ? 'Сохранение…' : 'Сохранить'}</Button></div>
                  </div>
                ) : document.extracted_data ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{extractedFields.map((field) => <Field key={field.key} label={field.label} value={document.extracted_data?.[field.key] || '—'} />)}</div>
                ) : <p className="mt-4 text-sm text-muted-foreground">OCR ещё не выполнялся или данные отсутствуют.</p>}
              </div>
            </div>
          ) : null}
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Удалить документ?">
        <p className="text-sm text-muted-foreground">Будут удалены запись и файл из защищённого хранилища. Документы, связанные с заявкой или историей полиса, удалить нельзя.</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="outline" size="lg" onClick={() => setDeleteOpen(false)}>Отмена</Button><Button size="lg" disabled={busy !== null} onClick={remove}>{busy === 'delete' ? 'Удаление…' : 'Удалить'}</Button></div>
      </Dialog>
    </>
  )
}
