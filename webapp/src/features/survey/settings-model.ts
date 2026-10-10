import type {
  ChipColor,
  FactType,
  FindingStatusItem,
  ProjectSettings,
} from '@ordiks-survey/contracts'

// ============================================================
// Справочники проекта (settings JSON): чистая логика редактора
// настроек — вкладка «Справочники» и тесты считают одинаково.
// ============================================================

export const CHIP_COLORS: readonly ChipColor[] = ['gray', 'blue', 'purple', 'amber', 'red', 'green']

export const CHIP_COLOR_LABELS: Record<ChipColor, string> = {
  gray: 'Серый',
  blue: 'Синий',
  purple: 'Фиолетовый',
  amber: 'Янтарный',
  red: 'Красный',
  green: 'Зелёный',
}

/** Слуг для id статуса/ключа типа факта: «В работе» → «в-работе». */
export function dictionarySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
}

/** Уникальный id статуса: слуг имени, при коллизии — суффикс -2, -3… */
export function statusIdFor(name: string, existing: readonly FindingStatusItem[]): string {
  const base = dictionarySlug(name) || 'status'
  if (!existing.some((status) => status.id === base)) return base
  for (let counter = 2; ; counter += 1) {
    const candidate = `${base}-${counter}`
    if (!existing.some((status) => status.id === candidate)) return candidate
  }
}

/** Уникальный ключ типа факта по имени (фото → photo занят → photo-2). */
export function factTypeKeyFor(name: string, existing: readonly FactType[]): string {
  const base = dictionarySlug(name) || 'fact'
  if (!existing.some((type) => type.key === base)) return base
  for (let counter = 2; ; counter += 1) {
    const candidate = `${base}-${counter}`
    if (!existing.some((type) => type.key === candidate)) return candidate
  }
}

/** Смена цвета статуса: новый массив, остальные записи без изменений (иммутабельно). */
export function setStatusColor(
  statuses: readonly FindingStatusItem[],
  statusId: string,
  color: ChipColor,
): FindingStatusItem[] {
  return statuses.map((status) => (status.id === statusId ? { ...status, color } : status))
}

/** Смена имени статуса с сохранением id (находки ссылаются на id). */
export function setStatusName(
  statuses: readonly FindingStatusItem[],
  statusId: string,
  name: string,
): FindingStatusItem[] {
  const trimmed = name.trim()
  return statuses.map((status) =>
    status.id === statusId ? { ...status, name: trimmed.length > 0 ? trimmed : status.name } : status,
  )
}

/** Строки textarea → массив элементов справочника: трим, пустые выбрасываются. */
export function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** Смена цвета типа факта. */
export function setFactTypeColor(
  types: readonly FactType[],
  key: string,
  color: ChipColor,
): FactType[] {
  return types.map((type) => (type.key === key ? { ...type, color } : type))
}

export type DictionaryDraft = {
  statuses: FindingStatusItem[]
  categoriesText: string
  prioritiesText: string
  factTypes: FactType[]
}

export function dictionaryDraft(settings: ProjectSettings): DictionaryDraft {
  return {
    statuses: settings.findingStatuses.map((status) => ({ ...status })),
    categoriesText: settings.findingCategories.join('\n'),
    prioritiesText: settings.findingPriorities.join('\n'),
    factTypes: settings.factTypes.map((type) => ({ ...type })),
  }
}

export type DictionaryErrors = Partial<
  Record<'statuses' | 'factTypes' | 'categories' | 'priorities', string>
>

/**
 * Черновик редактора → settings для PATCH. Поля паспорта переносятся как есть.
 * Ошибки — по блокам, чтобы вкладка показывала их у соответствующего справочника.
 */
export function settingsFromDraft(
  draft: DictionaryDraft,
  settings: ProjectSettings,
): { errors: DictionaryErrors; settings: ProjectSettings | null } {
  const errors: DictionaryErrors = {}

  const statusIds = new Set<string>()
  for (const status of draft.statuses) {
    if (statusIds.has(status.id)) {
      errors.statuses = 'Идентификаторы статусов должны быть уникальны.'
      break
    }
    statusIds.add(status.id)
  }
  if (draft.statuses.length > 50) errors.statuses = 'Максимум 50 статусов.'

  const typeKeys = new Set<string>()
  for (const type of draft.factTypes) {
    if (typeKeys.has(type.key)) {
      errors.factTypes = 'Ключи типов фактов должны быть уникальны.'
      break
    }
    typeKeys.add(type.key)
  }
  if (draft.factTypes.length > 50) errors.factTypes = 'Максимум 50 типов фактов.'

  const categories = parseLines(draft.categoriesText)
  const priorities = parseLines(draft.prioritiesText)
  if (categories.length > 50) errors.categories = 'Максимум 50 категорий.'
  if (priorities.length > 50) errors.priorities = 'Максимум 50 приоритетов.'

  if (Object.keys(errors).length > 0) return { errors, settings: null }

  return {
    errors: {},
    settings: {
      findingCategories: categories,
      findingPriorities: priorities,
      findingStatuses: draft.statuses,
      factTypes: draft.factTypes,
      passportFields: settings.passportFields,
      passportValues: settings.passportValues,
    },
  }
}
