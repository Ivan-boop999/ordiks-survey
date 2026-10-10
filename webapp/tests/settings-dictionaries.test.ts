import { expect, test } from 'bun:test'

import type { ProjectSettings } from '@ordiks-survey/contracts'

import {
  dictionaryDraft,
  dictionarySlug,
  factTypeKeyFor,
  parseLines,
  setFactTypeColor,
  setStatusColor,
  setStatusName,
  settingsFromDraft,
  statusIdFor,
} from '../src/features/survey/settings-model'
import { findingStatusMeta } from '../src/features/survey/model'

const settings: ProjectSettings = {
  findingCategories: ['Процесс', 'Данные'],
  findingPriorities: ['Критично', 'Высокий'],
  findingStatuses: [
    { id: 'registered', name: 'Зарегистрирована', color: 'gray' },
    { id: 'confirmed', name: 'Подтверждена', color: 'blue' },
    { id: 'closed', name: 'Закрыта', color: 'green' },
  ],
  factTypes: [
    { key: 'photo', name: 'Фото', kind: 'photo', icon: 'image', color: 'purple' },
    { key: 'file', name: 'Файл', kind: 'file', icon: 'file', color: 'blue' },
  ],
  passportFields: [
    { id: 'industry', name: 'Отрасль', type: 'text' },
  ],
  passportValues: { industry: 'ЖБИ' },
}

test('changing a status color rewrites only that status and keeps the rest untouched', () => {
  const next = setStatusColor(settings.findingStatuses, 'confirmed', 'red')
  expect(next).toHaveLength(3)
  expect(next.find((status) => status.id === 'confirmed')?.color).toBe('red')
  expect(next.find((status) => status.id === 'registered')?.color).toBe('gray')
  expect(next.find((status) => status.id === 'closed')?.color).toBe('green')
  // Исходный справочник не мутирует: чипы находок перечитают его целиком.
  expect(settings.findingStatuses.find((status) => status.id === 'confirmed')?.color).toBe('blue')

  // Новый цвет сразу виден в мете чипа статуса находки.
  const meta = findingStatusMeta('confirmed', next)
  expect(meta).toEqual({ label: 'Подтверждена', color: 'red' })

  const renamed = setStatusName(next, 'confirmed', '  Согласована  ')
  expect(renamed.find((status) => status.id === 'confirmed')?.name).toBe('Согласована')
  // Пустое имя не затирает прежнее.
  const kept = setStatusName(renamed, 'confirmed', '   ')
  expect(kept.find((status) => status.id === 'confirmed')?.name).toBe('Согласована')
})

test('new status ids slug the name and stay unique', () => {
  expect(dictionarySlug('  В работе ')).toBe('в-работе')
  const first = statusIdFor('В работе', settings.findingStatuses)
  expect(first).toBe('в-работе')
  const second = statusIdFor('В работе', [...settings.findingStatuses, { id: first, name: 'В работе', color: 'amber' }])
  expect(second).toBe('в-работе-2')

  expect(factTypeKeyFor('Видео', settings.factTypes)).toBe('видео')
  expect(factTypeKeyFor('Фото', settings.factTypes)).toBe('фото')
  // Коллизия только при точном совпадении слага с существующим ключом.
  expect(
    factTypeKeyFor('Видео', [
      ...settings.factTypes,
      { key: 'видео', name: 'Видео', kind: 'note', icon: 'note', color: 'gray' },
    ]),
  ).toBe('видео-2')
})

test('fact type color change rewrites only that type', () => {
  const next = setFactTypeColor(settings.factTypes, 'file', 'amber')
  expect(next.find((type) => type.key === 'file')?.color).toBe('amber')
  expect(next.find((type) => type.key === 'photo')?.color).toBe('purple')
})

test('dictionary draft maps settings to editor state and back through parseLines', () => {
  const draft = dictionaryDraft(settings)
  expect(draft.statuses).toEqual(settings.findingStatuses)
  expect(draft.categoriesText).toBe('Процесс\nДанные')
  expect(draft.prioritiesText).toBe('Критично\nВысокий')

  expect(parseLines(' Критично \n\n Высокий \n')).toEqual(['Критично', 'Высокий'])
})

test('settings from draft produce a PATCH payload and keep passport fields', () => {
  const draft = dictionaryDraft(settings)
  draft.statuses = setStatusColor(draft.statuses, 'closed', 'red')
  draft.categoriesText = 'Процесс\nДанные\nОрганизация'
  draft.prioritiesText = 'Критично\nСредний'
  const result = settingsFromDraft(draft, settings)

  expect(result.errors).toEqual({})
  expect(result.settings).not.toBe(null)
  expect(result.settings && result.settings.findingCategories).toEqual(['Процесс', 'Данные', 'Организация'])
  expect(result.settings && result.settings.findingPriorities).toEqual(['Критично', 'Средний'])
  expect(result.settings && result.settings.findingStatuses.find((status) => status.id === 'closed')?.color).toBe('red')
  expect(result.settings && result.settings.passportValues).toEqual({ industry: 'ЖБИ' })
})

test('settings from draft reject duplicate status ids and oversized dictionaries', () => {
  const dupe = dictionaryDraft(settings)
  dupe.statuses = [...dupe.statuses, { id: 'closed', name: 'Закрыта повторно', color: 'red' }]
  expect(settingsFromDraft(dupe, settings).settings).toBe(null)

  const tooMany = dictionaryDraft(settings)
  tooMany.factTypes = Array.from({ length: 51 }, (_, index) => ({
    key: `t${index}`,
    name: `Тип ${index}`,
    kind: 'note' as const,
    icon: 'note',
    color: 'gray' as const,
  }))
  const result = settingsFromDraft(tooMany, settings)
  expect(result.settings).toBe(null)
  expect(result.errors.factTypes).toBeTruthy()
})
