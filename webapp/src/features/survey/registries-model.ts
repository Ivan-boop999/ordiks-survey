import type {
  FormulaOperand,
  RegistryDto,
  RegistryEntryDto,
  RegistryFieldDto,
  RegistryFormula,
  RegistryStatusDto,
} from '@ordiks-survey/contracts'

import { formatDateRu } from './model'

// ============================================================
// Свои реестры: сортировки, отображение формул и записей,
// разбор импорта из текста — чистые функции для экрана и тестов
// (сервер остаётся источником вычислений formula-полей).
// ============================================================

export function sortedFields(fields: ReadonlyArray<RegistryFieldDto>): RegistryFieldDto[] {
  return fields.slice().sort((left, right) => left.sortOrder - right.sortOrder)
}

export function sortedStatuses(statuses: ReadonlyArray<RegistryStatusDto>): RegistryStatusDto[] {
  return statuses.slice().sort((left, right) => left.sortOrder - right.sortOrder)
}

/** Операнд формулы словами: «цена» (поле) или «10» (константа). */
function operandLabel(operand: FormulaOperand, fields: ReadonlyArray<RegistryFieldDto>): string {
  if (operand.type === 'const') return String(operand.value)
  return fields.find((field) => field.key === operand.key)?.name ?? operand.key
}

/** Человекочитаемая формула для таблицы и диалога: «цена × кол-во + 10». */
export function formulaLabel(
  formula: RegistryFormula,
  fields: ReadonlyArray<RegistryFieldDto>,
): string {
  const op = formula.op === '+' ? '+' : formula.op === '-' ? '−' : '×'
  return `${operandLabel(formula.a, fields)} ${op} ${operandLabel(formula.b, fields)}`
}

/** Значение поля записи для таблицы: formula → computed (DTO), даты — по-русски. */
export function entryFieldValue(entry: RegistryEntryDto, field: RegistryFieldDto): string {
  if (field.type === 'formula') {
    const computed = entry.computed[field.key]
    if (computed === null || computed === undefined) return '—'
    return String(computed)
  }
  const value = entry.values[field.key]
  if (value === undefined || value === null || value === '') return '—'
  if (field.type === 'date') return formatDateRu(String(value))
  return String(value)
}

/** Поля, участвующие в маппинге импорта (формула вычисляется на сервере). */
export function importableFields(registry: Pick<RegistryDto, 'fields'>): RegistryFieldDto[] {
  return sortedFields(registry.fields).filter((field) => field.type !== 'formula')
}

/** Разбор строки импорта: таб (вставка из Excel) или «;» — как на сервере. */
export function splitImportLine(line: string): string[] {
  return (line.includes('\t') ? line.split('\t') : line.split(';')).map((cell) => cell.trim())
}

export type ImportPreview = {
  /// Подписи колонок: первая строка (если заголовок) или «Колонка 1..N».
  headers: string[]
  /// Первые строки данных для предпросмотра.
  rows: string[][]
  /// Строк данных всего.
  rowCount: number
}

/** Предпросмотр вставки: строки, колонки и подписи для маппинга. */
export function previewImport(text: string, hasHeader: boolean, sampleLimit = 5): ImportPreview {
  const lines = String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim() !== '')
  const rows = lines.map(splitImportLine)
  const dataRows = hasHeader ? rows.slice(1) : rows
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const headers = hasHeader
    ? Array.from({ length: columnCount }, (_, index) => rows[0]?.[index] || `Колонка ${index + 1}`)
    : Array.from({ length: columnCount }, (_, index) => `Колонка ${index + 1}`)
  return { headers, rows: dataRows.slice(0, sampleLimit), rowCount: dataRows.length }
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

/** Цель маппинга колонки: ключ поля, 'status' или 'skip'. */
export type MappingTarget = string

/**
 * Автомаппинг колонок по заголовку: точное совпадение с названием/ключом поля (без учёта
 * регистра), «статус»/«status» → статус записи; остальное пропускается.
 */
export function suggestMapping(
  headers: ReadonlyArray<string>,
  registry: Pick<RegistryDto, 'fields' | 'statuses'>,
): Record<number, MappingTarget> {
  const mapping: Record<number, MappingTarget> = {}
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header)
    if (normalized === 'статус' || normalized === 'status') {
      if (registry.statuses.length > 0) mapping[index] = 'status'
      return
    }
    const field = importableFields(registry).find(
      (candidate) =>
        normalizeHeader(candidate.name) === normalized || candidate.key === normalized,
    )
    mapping[index] = field?.key ?? 'skip'
  })
  return mapping
}

/** Маппинг для отправки: числовые индексы колонок → строковые ключи JSON. */
export function mappingForApi(mapping: Record<number, MappingTarget>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [column, target] of Object.entries(mapping)) {
    if (target !== 'skip') result[column] = target
  }
  return result
}

/** Сырые значения формы записи → payload API: числа — number, пустое — отсутствие ключа. */
export function entryValuesFromInput(
  fields: ReadonlyArray<RegistryFieldDto>,
  input: Record<string, string>,
): Record<string, string | number> {
  const values: Record<string, string | number> = {}
  for (const field of fields) {
    if (field.type === 'formula') continue
    const raw = (input[field.key] ?? '').trim()
    if (raw === '') continue
    values[field.key] = field.type === 'number' ? Number(raw.replace(',', '.')) : raw
  }
  return values
}

/** Значения записи → сырые строки для формы редактирования. */
export function entryInputFromValues(entry: RegistryEntryDto): Record<string, string> {
  const input: Record<string, string> = {}
  for (const [key, value] of Object.entries(entry.values)) {
    input[key] = String(value)
  }
  return input
}

const RU_TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

/** Ключ поля из названия: транслит, латиница/цифры/_, начинается с буквы (regex контракта). */
export function suggestFieldKey(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .split('')
    .map((char) => RU_TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '')
  return slug || 'field'
}
