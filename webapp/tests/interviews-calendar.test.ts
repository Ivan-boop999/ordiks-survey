import { describe, expect, test } from 'bun:test'

import {
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  calendarHours,
  isSameDay,
  shiftWeek,
  slotOf,
  slotToDatetimeLocal,
  startOfWeek,
  weekDays,
} from '../src/features/survey/interviews-calendar'

describe('недельный календарь интервью', () => {
  test('startOfWeek возвращает понедельник недели', () => {
    // 2026-10-11 — воскресенье; понедельник той же недели — 2026-10-05.
    const monday = startOfWeek(new Date(2026, 9, 11))
    expect(monday.getDay()).toBe(1)
    expect(monday.getFullYear()).toBe(2026)
    expect(monday.getMonth()).toBe(9)
    expect(monday.getDate()).toBe(5)
    // Сам понедельник остаётся понедельником.
    expect(startOfWeek(new Date(2026, 9, 5)).getDate()).toBe(5)
  })

  test('weekDays даёт 7 дней подряд от понедельника', () => {
    const days = weekDays(new Date(2026, 9, 5))
    expect(days).toHaveLength(7)
    expect(days[0].getDay()).toBe(1)
    expect(days[6].getDay()).toBe(0)
    expect(days[6].getDate() - days[0].getDate()).toBe(6)
  })

  test('shiftWeek сдвигает на N недель', () => {
    const week = new Date(2026, 9, 5)
    expect(shiftWeek(week, 1).getDate()).toBe(12)
    expect(shiftWeek(week, -2).getDate()).toBe(21) // сентябрь
    expect(shiftWeek(week, -2).getMonth()).toBe(8)
  })

  test('slotOf кладёт интервью в свой день и час; вне сетки — null', () => {
    const week = new Date(2026, 9, 5) // Пн 05.10.2026
    expect(slotOf(new Date(2026, 9, 7, 14, 30), week)).toEqual({ dayIndex: 2, hour: 14 })
    // Воскресенье вне недели.
    expect(slotOf(new Date(2026, 9, 4, 10), week)).toBeNull()
    // Ночь вне часов сетки.
    expect(slotOf(new Date(2026, 9, 5, 7), week)).toBeNull()
    expect(slotOf(new Date(2026, 9, 5, 21), week)).toBeNull()
  })

  test('календарные часы 8..20 и слот → datetime-local', () => {
    const hours = calendarHours()
    expect(hours[0]).toBe(CALENDAR_START_HOUR)
    expect(hours[hours.length - 1]).toBe(CALENDAR_END_HOUR)
    const week = new Date(2026, 9, 5)
    expect(slotToDatetimeLocal(week, { dayIndex: 2, hour: 9 })).toBe('2026-10-07T09:00')
  })

  test('isSameDay сравнивает только дату', () => {
    expect(isSameDay(new Date(2026, 9, 7, 10), new Date(2026, 9, 7, 23))).toBe(true)
    expect(isSameDay(new Date(2026, 9, 7, 10), new Date(2026, 9, 8, 10))).toBe(false)
  })
})
