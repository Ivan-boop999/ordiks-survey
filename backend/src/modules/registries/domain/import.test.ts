import { describe, expect, test } from 'bun:test'

import { findStatusIdByName, normalizeImportCell, parseImportText, splitImportLine } from './import'

const numberField = { key: 'total', name: 'Циклов всего', type: 'number' as const, options: [] }
const dateField = { key: 'inspection', name: 'Дата осмотра', type: 'date' as const, options: [] }
const selectField = { key: 'type', name: 'Тип', type: 'select' as const, options: ['Форма', 'Матрица'] }
const textField = { key: 'number', name: 'Номер', type: 'text' as const, options: [] }

describe('парсер импорта реестра из текста', () => {
  test('splitImportLine: таб если есть, иначе «;», с тримом', () => {
    expect(splitImportLine('Ф-102\tФорма\t12000')).toEqual(['Ф-102', 'Форма', '12000'])
    expect(splitImportLine(' Ф-102 ; Форма ; 12000 ')).toEqual(['Ф-102', 'Форма', '12000'])
  })

  test('parseImportText: пустые строки выкидываются, заголовок срезается', () => {
    const { dataRows } = parseImportText('Номер\tТип\nФ-1\tФорма\n\nФ-2\tМатрица', true)
    expect(dataRows).toEqual([
      ['Ф-1', 'Форма'],
      ['Ф-2', 'Матрица'],
    ])
    expect(parseImportText('Ф-1\tФорма', false).dataRows).toEqual([['Ф-1', 'Форма']])
  })

  test('normalizeImportCell: число с запятой нормализуется в number', () => {
    expect(normalizeImportCell(numberField, '12000')).toEqual({ ok: true, value: 12000 })
    expect(normalizeImportCell(numberField, '100,5')).toEqual({ ok: true, value: 100.5 })
    expect(normalizeImportCell(numberField, '-7')).toEqual({ ok: true, value: -7 })
    expect(normalizeImportCell(numberField, '12 шт').ok).toBe(false)
    expect(normalizeImportCell(numberField, '').value).toBe('')
  })

  test('normalizeImportCell: даты дд.мм.гггг → ISO, ISO проходит, мусор и год <1900 — ошибка', () => {
    expect(normalizeImportCell(dateField, '01.03.2026')).toEqual({ ok: true, value: '2026-03-01' })
    expect(normalizeImportCell(dateField, '2026-03-01')).toEqual({ ok: true, value: '2026-03-01' })
    expect(normalizeImportCell(dateField, '31.02.2026').ok).toBe(false)
    expect(normalizeImportCell(dateField, '01.01.1899').ok).toBe(false)
    expect(normalizeImportCell(dateField, 'вчера').ok).toBe(false)
  })

  test('normalizeImportCell: select канонизируется без учёта регистра, чужое — ошибка', () => {
    expect(normalizeImportCell(selectField, 'форма')).toEqual({ ok: true, value: 'Форма' })
    expect(normalizeImportCell(selectField, 'Матрица')).toEqual({ ok: true, value: 'Матрица' })
    expect(normalizeImportCell(selectField, 'Палитра').ok).toBe(false)
  })

  test('normalizeImportCell: text проходит как есть', () => {
    expect(normalizeImportCell(textField, 'Ф-102')).toEqual({ ok: true, value: 'Ф-102' })
  })

  test('findStatusIdByName: без учёта регистра; пусто и незнакомое — null', () => {
    const statuses = [
      { id: 's1', name: 'В работе' },
      { id: 's2', name: 'Списана' },
    ]
    expect(findStatusIdByName(statuses, 'в работе')).toBe('s1')
    expect(findStatusIdByName(statuses, 'СПИСАНА')).toBe('s2')
    expect(findStatusIdByName(statuses, '')).toBeNull()
    expect(findStatusIdByName(statuses, 'Ремонт')).toBeNull()
  })
})
