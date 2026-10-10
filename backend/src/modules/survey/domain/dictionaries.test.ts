import { describe, expect, test } from 'bun:test'

import { projectSettingsSchema } from '@ordiks-survey/contracts'

import {
  checkFindingAgainstDictionaries,
  defaultFindingWrite,
  findingDictionaries,
  isRequestOverdue,
} from './dictionaries'

const settings = projectSettingsSchema.parse({})
const custom = projectSettingsSchema.parse({
  findingCategories: ['Процесс', 'Данные'],
  findingPriorities: ['Высокий'],
  findingStatuses: [{ id: 'open', name: 'Открыта' }, { id: 'done', name: 'Сделано' }],
})

describe('finding dictionaries', () => {
  test('prototype defaults fill in for empty settings', () => {
    const dictionaries = findingDictionaries(projectSettingsSchema.parse({}))
    expect(dictionaries.categories).toEqual(['Процесс', 'Данные', 'Оборудование', 'Организация'])
    expect(dictionaries.priorities).toContain('Средний')
    expect(dictionaries.statuses).toEqual(['registered', 'confirmed', 'discussed', 'closed'])
  })

  test('empty dictionary arrays fall back to the prototype defaults', () => {
    const emptied = findingDictionaries({
      ...settings,
      findingCategories: [],
      findingPriorities: [],
      findingStatuses: [],
    })
    expect(emptied.categories).not.toEqual([])
    expect(emptied.priorities).not.toEqual([])
    expect(emptied.statuses).not.toEqual([])
  })

  test('validates category, priority, and status against the project dictionaries', () => {
    const dictionaries = findingDictionaries(custom)
    expect(checkFindingAgainstDictionaries(dictionaries, { category: 'Процесс' }).ok).toBe(true)
    expect(checkFindingAgainstDictionaries(dictionaries, { priority: 'Средний' }).ok).toBe(false)
    expect(checkFindingAgainstDictionaries(dictionaries, { status: 'confirmed' }).ok).toBe(false)
    expect(checkFindingAgainstDictionaries(dictionaries, { status: 'done' }).ok).toBe(true)
    expect(checkFindingAgainstDictionaries(dictionaries, {})).toEqual({ ok: true })
  })

  test('create defaults come from the prototype and adapt to a custom dictionary', () => {
    expect(defaultFindingWrite(findingDictionaries(settings))).toEqual({
      category: 'Процесс',
      priority: 'Средний',
      status: 'registered',
    })
    // В кастомном справочнике нет «Среднего» и registered — берём первый элемент.
    expect(defaultFindingWrite(findingDictionaries(custom))).toEqual({
      category: 'Процесс',
      priority: 'Высокий',
      status: 'open',
    })
  })
})

describe('isRequestOverdue', () => {
  const now = new Date('2026-10-10T12:00:00.000Z')

  test('overdue only when the deadline passed and the status is not received', () => {
    expect(isRequestOverdue({ deadline: new Date('2026-10-09T12:00:00.000Z'), status: 'requested', now })).toBe(true)
    expect(isRequestOverdue({ deadline: new Date('2026-10-09T12:00:00.000Z'), status: 'in_progress', now })).toBe(true)
    // received — даже просроченный дедлайн больше не «просрочен».
    expect(isRequestOverdue({ deadline: new Date('2026-10-09T12:00:00.000Z'), status: 'received', now })).toBe(false)
    expect(isRequestOverdue({ deadline: new Date('2026-10-12T12:00:00.000Z'), status: 'requested', now })).toBe(false)
    expect(isRequestOverdue({ deadline: null, status: 'requested', now })).toBe(false)
  })
})
