import type { ProcessDto, ProcessStepDto, ProcessSide } from '@ordiks-survey/contracts'

// ============================================================
// Процессы AS-IS / TO-BE: чистая логика шагов и mapTo-связей —
// экраны и тесты считают порядок/селект одинаково.
// ============================================================

/** Шаги одной стороны по порядку (sortOrder, затем стабильный id). */
export function stepsOfSide(process: ProcessDto, side: ProcessSide): ProcessStepDto[] {
  return process.steps
    .filter((step) => step.side === side)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
}

/**
 * Значение селекта mapTo для шага AS-IS: id шага TO-BE, 'none' («исчезает»)
 * или '' («не определено»).
 */
export const MAP_TO_NONE = 'none'
export const MAP_TO_UNSET = ''

export function mapToSelectValue(step: ProcessStepDto): string {
  if (step.disappears) return MAP_TO_NONE
  return step.mapToStepId ?? MAP_TO_UNSET
}

/** Патч обновления шага из выбранного значения селекта mapTo. */
export function mapToPatch(
  value: string,
): { mapToStepId: string | null; disappears: boolean } {
  if (value === MAP_TO_NONE) return { mapToStepId: null, disappears: true }
  if (value === MAP_TO_UNSET) return { mapToStepId: null, disappears: false }
  return { mapToStepId: value, disappears: false }
}

/** Полный порядок id после сдвига шага на index вверх/вниз (для reorder-эндпоинта). */
export function moveStepIds(ids: string[], index: number, direction: -1 | 1): string[] {
  const target = ids[index]
  const neighbor = ids[index + direction]
  if (target === undefined || neighbor === undefined) return ids
  const next = ids.slice()
  next[index] = neighbor
  next[index + direction] = target
  return next
}

/** Строка «1. Заголовок» для опций селекта сравнения. */
export function numberedStepLabel(step: ProcessStepDto, position: number): string {
  return `${position}. ${step.title}`
}
