import type { ChipColor } from '@ordiks-survey/contracts'

/**
 * Палитра чипов приложения — перенос FSTAT_PALETTE прототипа. Классы вместо инлайн-цветов,
 * чтобы тёмная тема шаблона (`.dark`) подхватывала те же токены. Отдельный модуль (не файл
 * компонента), чтобы fast-refresh оставался корректным.
 */
export const chipColorClass: Record<ChipColor, string> = {
  gray: 'border-transparent bg-muted text-muted-foreground',
  blue: 'border-blue-200/60 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/15 dark:text-blue-300',
  green:
    'border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/15 dark:text-emerald-300',
  red: 'border-red-200/60 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-500/15 dark:text-red-300',
  amber:
    'border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/15 dark:text-amber-300',
  purple:
    'border-violet-200/60 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-500/15 dark:text-violet-300',
}

/** Цветная «плашка» иконки KPI-карточки (прототип: .sicon). */
export const iconPlateClass: Record<ChipColor, string> = {
  gray: 'bg-muted text-muted-foreground',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  red: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  purple: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
}
