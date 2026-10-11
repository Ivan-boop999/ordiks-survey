import { describe, expect, test } from 'bun:test'
import type {
  RegistryDto,
  RegistryEntryDto,
  RegistryFieldDto,
} from '@ordiks-survey/contracts'

import {
  entryFieldValue,
  entryValuesFromInput,
  formulaLabel,
  importableFields,
  mappingForApi,
  previewImport,
  sortedFields,
  splitImportLine,
  suggestFieldKey,
  suggestMapping,
} from '../src/features/survey/registries-model'

function field(overrides: Partial<RegistryFieldDto> = {}): RegistryFieldDto {
  return {
    id: 'fld-1',
    registryId: 'reg-1',
    key: 'name',
    name: 'Название',
    type: 'text',
    options: [],
    formula: null,
    sortOrder: 0,
    ...overrides,
  }
}

function entry(overrides: Partial<RegistryEntryDto> = {}): RegistryEntryDto {
  return {
    id: 'e1',
    registryId: 'reg-1',
    statusId: null,
    values: {},
    computed: {},
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

const price = field({ id: 'fld-2', key: 'price', name: 'Цена', type: 'number', sortOrder: 1 })
const qty = field({ id: 'fld-3', key: 'qty', name: 'Кол-во', type: 'number', sortOrder: 2 })
const total = field({
  id: 'fld-4',
  key: 'total',
  name: 'Стоимость',
  type: 'formula',
  sortOrder: 3,
  formula: { op: '*', a: { type: 'field', key: 'price' }, b: { type: 'field', key: 'qty' } },
})

const registry: Pick<RegistryDto, 'fields' | 'statuses'> = {
  fields: [total, price, qty, field()],
  statuses: [
    { id: 'st-1', registryId: 'reg-1', name: 'На складе', color: 'green', sortOrder: 0 },
    { id: 'st-2', registryId: 'reg-1', name: 'В работе', color: 'amber', sortOrder: 1 },
  ],
}

describe('конструктор полей', () => {
  test('sortedFields сортирует по sortOrder', () => {
    expect(sortedFields(registry.fields).map((item) => item.key)).toEqual(['name', 'price', 'qty', 'total'])
  })

  test('importableFields исключает формулы — их считает сервер', () => {
    expect(importableFields(registry).map((item) => item.key)).toEqual(['name', 'price', 'qty'])
  })

  test('suggestFieldKey транслитерирует название в ключ контракта', () => {
    expect(suggestFieldKey('Кол-во')).toBe('kol_vo')
    expect(suggestFieldKey('Цена за единицу')).toBe('cena_za_edinicu')
    expect(suggestFieldKey('  SKU ')).toBe('sku')
    expect(suggestFieldKey('7 дней')).toBe('dney')
    expect(suggestFieldKey('!!!')).toBe('field')
  })
})

describe('формула', () => {
  test('formulaLabel показывает поля и константу по-человечески', () => {
    expect(formulaLabel(total.formula!, registry.fields)).toBe('Цена × Кол-во')
    const withConst = { ...total.formula!, b: { type: 'const', value: 10 } as const }
    expect(formulaLabel(withConst, registry.fields)).toBe('Цена × 10')
  })

  test('entryFieldValue берёт formula-значение из computed DTO, а не из values', () => {
    const row = entry({
      values: { name: 'Фреза', price: 1250, qty: 4 },
      computed: { total: 5000 },
    })
    expect(entryFieldValue(row, total)).toBe('5000')
    expect(entryFieldValue(row, price)).toBe('1250')
    expect(entryFieldValue(row, field())).toBe('Фреза')
  })

  test('битая формула (null в computed) и пустые значения → «—»', () => {
    const row = entry({ values: {}, computed: { total: null } })
    expect(entryFieldValue(row, total)).toBe('—')
    expect(entryFieldValue(row, field())).toBe('—')
  })

  test('дата показывается по-русски', () => {
    const bought = field({ id: 'fld-5', key: 'bought', name: 'Куплено', type: 'date' })
    expect(entryFieldValue(entry({ values: { bought: '2026-03-05' } }), bought)).toContain('мар')
  })
})

describe('импорт из текста', () => {
  test('splitImportLine режет по табу, иначе по «;», и тримит ячейки', () => {
    expect(splitImportLine('Фреза\t1250\t4')).toEqual(['Фреза', '1250', '4'])
    expect(splitImportLine('Фреза; 1250 ;4')).toEqual(['Фреза', '1250', '4'])
  })

  test('previewImport: заголовок даёт подписи колонок, строки данных считаются', () => {
    const text = 'Название\tЦена\tКол-во\tСтатус\nФреза\t1250\t4\tНа складе\nРезец\t300\t10\tВ работе'
    const preview = previewImport(text, true)
    expect(preview.headers).toEqual(['Название', 'Цена', 'Кол-во', 'Статус'])
    expect(preview.rowCount).toBe(2)
    expect(preview.rows[0]).toEqual(['Фреза', '1250', '4', 'На складе'])
  })

  test('previewImport без заголовка нумерует колонки', () => {
    const preview = previewImport('Фреза\t1250', false)
    expect(preview.headers).toEqual(['Колонка 1', 'Колонка 2'])
    expect(preview.rowCount).toBe(1)
  })

  test('suggestMapping матчит поля по названию/ключу, «статус» — статус, мусор — skip', () => {
    const mapping = suggestMapping(['Название', 'цена', 'Qty', 'Статус', 'Комментарий'], registry)
    expect(mapping).toEqual({ 0: 'name', 1: 'price', 2: 'qty', 3: 'status', 4: 'skip' })
  })

  test('mappingForApi убирает skip и stringify индексы (формат API)', () => {
    expect(mappingForApi({ 0: 'name', 1: 'skip', 2: 'status' })).toEqual({ 0: 'name', 2: 'status' })
    expect(Object.keys(mappingForApi({ 1: 'skip' }))).toEqual([])
  })
})

describe('значения записи', () => {
  test('entryValuesFromInput конвертирует числа и выкидывает пустые/formula ключи', () => {
    const input = { name: 'Фреза', price: '1250,50', qty: ' 4 ', total: 'введённое', note: '' }
    expect(entryValuesFromInput(registry.fields, input)).toEqual({
      name: 'Фреза',
      price: 1250.5,
      qty: 4,
    })
  })
})
