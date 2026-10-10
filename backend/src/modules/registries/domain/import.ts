import type { RegistryFieldType } from '@ordiks-survey/contracts'

/**
 * Парсер импорта записей реестра из текста (перенос учётного листа из Excel): одна строка =
 * одна запись, разделитель ячеек — табуляция (вставка из Excel) или «;» — как cregImpSplitLine
 * прототипа. Числа нормализуются (запятая → точка), даты дд.мм.гггг → ISO, select сверяется
 * по регистронезависимости и возвращает канонический вариант.
 */

export type ImportField = {
  key: string
  name: string
  type: RegistryFieldType
  options: string[]
}

export type ParsedImportRows = {
  /// Ячейки по строкам, без заголовка.
  dataRows: string[][]
}

export function splitImportLine(line: string): string[] {
  return (line.includes('\t') ? line.split('\t') : line.split(';')).map((cell) => cell.trim())
}

export function parseImportText(text: string, hasHeader: boolean): ParsedImportRows {
  const lines = String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim() !== '')
  const rows = lines.map(splitImportLine)
  return { dataRows: hasHeader ? rows.slice(1) : rows }
}

export type CellParseResult = {
  ok: boolean
  value?: string | number
  error?: string
}

const NUMBER_PATTERN = /^-?\d+([.,]\d+)?$/

export function normalizeImportCell(field: ImportField, raw: string): CellParseResult {
  const value = String(raw ?? '').trim()
  if (value === '') return { ok: true, value: '' }

  if (field.type === 'number') {
    if (!NUMBER_PATTERN.test(value)) return { ok: false, error: `«${value}» — не число` }
    return { ok: true, value: Number(value.replace(',', '.')) }
  }
  if (field.type === 'date') {
    let iso = ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) iso = value
    else if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) iso = `${value.slice(6)}-${value.slice(3, 5)}-${value.slice(0, 2)}`
    if (iso === '' || !isRealCalendarDate(iso) || Number(iso.slice(0, 4)) < 1900) {
      return { ok: false, error: `«${value}» — не дата` }
    }
    return { ok: true, value: iso }
  }
  if (field.type === 'select') {
    const option = (field.options ?? []).find((candidate) => candidate.toLowerCase() === value.toLowerCase())
    if (!option) return { ok: false, error: `«${value}» нет в списке` }
    return { ok: true, value: option }
  }
  return { ok: true, value }
}

/// Настоящая календарная проверка: JS Date скатывает 31.02 в 3 марта, надо ловить явно.
function isRealCalendarDate(iso: string): boolean {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  if (month < 1 || month > 12 || day < 1) return false
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth
}

/** Статус по названию (без учёта регистра); пустая строка — «не задан». */
export function findStatusIdByName(statuses: Array<{ id: string; name: string }>, raw: string): string | null {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === '') return null
  return statuses.find((status) => status.name.toLowerCase() === value)?.id ?? null
}
