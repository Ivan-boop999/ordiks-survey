import {
  DEFAULT_FINDING_CATEGORIES,
  DEFAULT_FINDING_PRIORITIES,
  type ProjectSettings,
} from '@ordiks-survey/contracts'

/**
 * Справочники находок: строки категорий/приоритетов и допустимые id статусов берутся из
 * settings проекта, а когда settings пусты/неполны — подставляются дефолты прототипа
 * (projectSettingsSchema уже заполняет их при чтении, здесь фолбэк дублируется для явности
 * и для защиты от пустых массивов, присланного целиком settings без элементов).
 */

export type FindingDictionaries = {
  categories: string[]
  priorities: string[]
  statuses: string[]
}

export function findingDictionaries(settings: ProjectSettings): FindingDictionaries {
  return {
    categories: settings.findingCategories.length > 0
      ? settings.findingCategories
      : [...DEFAULT_FINDING_CATEGORIES],
    priorities: settings.findingPriorities.length > 0
      ? settings.findingPriorities
      : [...DEFAULT_FINDING_PRIORITIES],
    statuses: settings.findingStatuses.length > 0
      ? settings.findingStatuses.map((status) => status.id)
      : ['registered', 'confirmed', 'discussed', 'closed'],
  }
}

export type FindingDictionaryCheck =
  | { ok: true }
  | { ok: false; field: 'category' | 'priority' | 'status'; message: string }

/** Проверяет одну тройку категория/приоритет/статус против справочников проекта. */
export function checkFindingAgainstDictionaries(
  dictionaries: FindingDictionaries,
  value: { category?: string; priority?: string; status?: string },
): FindingDictionaryCheck {
  if (value.category !== undefined && !dictionaries.categories.includes(value.category)) {
    return { ok: false, field: 'category', message: 'Category is not in the project dictionary' }
  }
  if (value.priority !== undefined && !dictionaries.priorities.includes(value.priority)) {
    return { ok: false, field: 'priority', message: 'Priority is not in the project dictionary' }
  }
  if (value.status !== undefined && !dictionaries.statuses.includes(value.status)) {
    return { ok: false, field: 'status', message: 'Status is not in the project dictionary' }
  }
  return { ok: true }
}

/**
 * Дефолт при создании: приоритет/категория/статус по прототипу; если дефолта в справочнике
 * проекта нет (кастомный справочник), берём первый элемент справочника.
 */
export function defaultFindingWrite(dictionaries: FindingDictionaries): {
  category: string
  priority: string
  status: string
} {
  return {
    category: dictionaries.categories.includes('Процесс') ? 'Процесс' : dictionaries.categories[0],
    priority: dictionaries.priorities.includes('Средний') ? 'Средний' : dictionaries.priorities[0],
    status: dictionaries.statuses.includes('registered') ? 'registered' : dictionaries.statuses[0],
  }
}

/// Просрочка запроса данных: дедлайн прошёл, а статус ещё не received (requestOverdue прототипа).
export function isRequestOverdue(request: {
  deadline: Date | null
  status: string
  now: Date
}): boolean {
  return request.deadline !== null && request.status !== 'received' && request.deadline < request.now
}
