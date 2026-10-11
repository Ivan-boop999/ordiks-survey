// ============================================================
// Недельный календарь интервью: чистые функции сетки недели
// (Пн–Вс × часы 8:00–20:00) — экран и тесты считают слоты
// одинаково.
// ============================================================

export const CALENDAR_START_HOUR = 8
export const CALENDAR_END_HOUR = 20

/** Полночь понедельника недели, содержащей date (неделя начинается с Пн). */
export function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = (result.getDay() + 6) % 7 // Вс (0) → 6
  result.setDate(result.getDate() - day)
  return result
}

/** Семь дней недели от понедельника. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + index)
    return day
  })
}

/** Сдвиг недели на N недель. */
export function shiftWeek(weekStart: Date, weeks: number): Date {
  const next = new Date(weekStart)
  next.setDate(next.getDate() + weeks * 7)
  return next
}

export function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

/** Часы строк сетки: 8..20 (включительно — слот 20:00 закрывает вечер). */
export function calendarHours(): number[] {
  return Array.from(
    { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
    (_, index) => CALENDAR_START_HOUR + index,
  )
}

export type CalendarSlot = { dayIndex: number; hour: number }

/** Слот календаря для ISO-даты интервью; вне сетки — null. */
export function slotOf(value: string | Date, weekStart: Date): CalendarSlot | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const dayIndex = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).getTime()) /
      (24 * 60 * 60 * 1000),
  )
  if (dayIndex < 0 || dayIndex > 6) return null
  const hour = date.getHours()
  if (hour < CALENDAR_START_HOUR || hour > CALENDAR_END_HOUR) return null
  return { dayIndex, hour }
}

/** Значение для datetime-local предзаполнения из слота (клик по пустой ячейке). */
export function slotToDatetimeLocal(weekStart: Date, slot: CalendarSlot): string {
  const day = new Date(weekStart)
  day.setDate(day.getDate() + slot.dayIndex)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T${pad(slot.hour)}:00`
}
