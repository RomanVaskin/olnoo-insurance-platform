'use client'

import { useRef, useState } from 'react'
import { Download, Upload, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ApiError,
  commitImport,
  downloadImportTemplate,
  previewImport,
  type ImportCommitResult,
  type ImportPreviewResult,
  type ImportType,
} from '@/lib/api'

// Mirrors the row-level error codes the backend's four import processors return
// (see src/modules/imports/processors.ts).
const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Не указано название',
  slug_required: 'Не указан slug',
  invalid_slug: 'Некорректный slug (латиница, цифры, дефисы)',
  invalid_status: 'Недопустимый статус',
  last_name_required: 'Не указана фамилия',
  first_name_required: 'Не указано имя',
  invalid_birth_date: 'Некорректная дата рождения (ГГГГ-ММ-ДД)',
  invalid_gender: 'Недопустимый пол',
  invalid_email: 'Некорректный email',
  federation_not_found: 'Федерация не найдена',
  ambiguous_federation_match: 'Название федерации соответствует нескольким записям',
  invalid_weight: 'Некорректный вес',
  federation_required_for_membership: 'Для клуба/тренера/разряда/веса/вида спорта нужно указать федерацию',
  ambiguous_person_match: 'Найдено несколько совпадений по ФИО, отчеству и дате рождения',
  category_required: 'Не указана категория',
  invalid_category: 'Недопустимая категория',
  invalid_coverage_amount: 'Некорректная сумма покрытия',
  validity_days_required: 'Не указан срок действия',
  invalid_validity_days: 'Некорректный срок действия',
  base_price_required: 'Не указана базовая цена',
  invalid_base_price: 'Некорректная базовая цена',
  ambiguous_product_match: 'Название продукта соответствует нескольким записям',
  product_not_found: 'Продукт не найден',
  federation_required: 'Не указана федерация',
  product_required: 'Не указан продукт',
  price_required: 'Не указана цена',
  invalid_price: 'Некорректная цена',
  invalid_active: 'Недопустимое значение активности',
  ambiguous_assignment_match: 'Найдено несколько назначений для этой пары федерация/продукт',
  federation_already_has_active_product: 'У федерации уже есть другой активный продукт',
  empty_workbook: 'Файл не содержит строк с данными',
  file_required: 'Файл не выбран',
  type_required: 'Не указан тип импорта',
  invalid_import_type: 'Недопустимый тип импорта',
  rows_required: 'Нет строк для импорта',
  forbidden: 'Недостаточно прав для этого действия',
}

const DUPLICATE_LABELS: Record<string, string> = {
  duplicate_slug_in_file: 'Дублирующийся slug в файле',
  duplicate_name_in_file: 'Дублирующееся название в файле',
  duplicate_person_in_file: 'Дублирующийся спортсмен в файле',
  duplicate_assignment_in_file: 'Дублирующееся назначение в файле',
  duplicate_active_federation_in_file: 'Ещё одна активная строка для этой федерации в файле',
}

function translateError(code: string): string {
  const [base, param] = code.split(':')
  const duplicateLabel = DUPLICATE_LABELS[base]
  if (duplicateLabel) {
    const rowNum = param?.replace('row_', '')
    return `${duplicateLabel} (строка ${rowNum})`
  }
  return ERROR_MESSAGES[code] ?? code
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Создать',
  update: 'Обновить',
  skip: 'Пропустить',
}

export function ImportTypeCard({ type, title, description }: { type: ImportType; title: string; description: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null)
  const [loading, setLoading] = useState<'preview' | 'commit' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPreview(null)
    setCommitResult(null)
    setError(null)
  }

  async function handleTemplateDownload() {
    try {
      await downloadImportTemplate(type)
    } catch {
      setError('Не удалось скачать шаблон.')
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    reset()
    if (!file) {
      setFileName(null)
      return
    }
    setFileName(file.name)
    setLoading('preview')
    try {
      const result = await previewImport(type, file)
      setPreview(result)
    } catch (err) {
      setError(err instanceof ApiError && err.message ? translateError(err.message) : 'Не удалось обработать файл.')
    } finally {
      setLoading(null)
    }
  }

  async function handleCommit() {
    if (!preview) return
    const rows = preview.rows
      .filter((r) => r.errors.length === 0 && r.data)
      .map((r) => ({ row_number: r.row_number, raw: r.raw }))
    if (rows.length === 0) return

    setLoading('commit')
    setError(null)
    try {
      const result = await commitImport(type, rows)
      setCommitResult(result)
    } catch (err) {
      setError(err instanceof ApiError && err.message ? translateError(err.message) : 'Не удалось выполнить импорт.')
    } finally {
      setLoading(null)
    }
  }

  const canCommit = Boolean(preview && preview.valid_rows > 0 && !commitResult)

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleTemplateDownload}>
          <Download className="size-3.5" />
          Скачать шаблон
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={loading !== null}>
          <Upload className="size-3.5" />
          Выбрать файл .xlsx
        </Button>
        {fileName ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileSpreadsheet className="size-3.5" />
            {fileName}
          </span>
        ) : null}
        {loading === 'preview' ? <span className="text-xs text-muted-foreground">Обработка файла…</span> : null}
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {preview ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              Всего строк: <span className="font-medium">{preview.total_rows}</span>
            </span>
            <span className="text-foreground">
              Валидных: <span className="font-medium">{preview.valid_rows}</span>
            </span>
            <span className={preview.invalid_rows > 0 ? 'text-destructive' : 'text-muted-foreground'}>
              С ошибками: <span className="font-medium">{preview.invalid_rows}</span>
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                <tr className="border-b border-border text-left">
                  {['Строка', 'Действие', 'Ошибки'].map((h) => (
                    <th key={h} className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row_number} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.row_number}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          row.errors.length > 0
                            ? 'inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground'
                            : 'inline-flex items-center rounded-full bg-foreground px-2 py-0.5 text-xs text-background'
                        }
                      >
                        {ACTION_LABELS[row.action]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-destructive">
                      {row.errors.length > 0 ? row.errors.map(translateError).join('; ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button size="lg" disabled={!canCommit || loading !== null} onClick={handleCommit}>
            {loading === 'commit' ? 'Импорт…' : 'Импортировать'}
          </Button>
        </div>
      ) : null}

      {commitResult ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium">Результат импорта</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <span>
              Создано: <span className="font-medium">{commitResult.created}</span>
            </span>
            <span>
              Обновлено: <span className="font-medium">{commitResult.updated}</span>
            </span>
            <span>
              Пропущено: <span className="font-medium">{commitResult.skipped}</span>
            </span>
          </div>
          {commitResult.errors.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-destructive">
              {commitResult.errors.map((e) => (
                <li key={e.row_number}>
                  Строка {e.row_number}: {e.errors.map(translateError).join('; ')}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
