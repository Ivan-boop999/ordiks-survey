import { describe, expect, test } from 'bun:test'

import { computeFormulaValue, computeFormulaValues, formulaReferencesSatisfiable } from './formula'

const fields = [
  { key: 'total', type: 'number' },
  { key: 'worked', type: 'number' },
  { key: 'note', type: 'text' },
  { key: 'left', type: 'formula' },
]

describe('формулы реестра: значения считаются, не хранятся', () => {
  test('остаток = всего − наработка (ссылки на number-поля)', () => {
    const formula = { op: '-' as const, a: { type: 'field' as const, key: 'total' }, b: { type: 'field' as const, key: 'worked' } }
    expect(computeFormulaValue(formula, fields, { total: 12000, worked: 7700 })).toBe(4300)
  })

  test('константы и умножение/сложение', () => {
    expect(
      computeFormulaValue(
        { op: '*', a: { type: 'field', key: 'total' }, b: { type: 'const', value: 0.5 } },
        fields,
        { total: 10 },
      ),
    ).toBe(5)
    expect(
      computeFormulaValue(
        { op: '+', a: { type: 'const', value: 2 }, b: { type: 'const', value: 3 } },
        fields,
        {},
      ),
    ).toBe(5)
  })

  test('числа-строки нормализуются (запятая → точка)', () => {
    expect(
      computeFormulaValue(
        { op: '-', a: { type: 'field', key: 'total' }, b: { type: 'field', key: 'worked' } },
        fields,
        { total: '100,5', worked: '0,25' },
      ),
    ).toBe(100.25)
  })

  test('пустой операнд, ссылка на не-number поле и мусорная формула → null', () => {
    const formula = { op: '-' as const, a: { type: 'field' as const, key: 'total' }, b: { type: 'field' as const, key: 'worked' } }
    expect(computeFormulaValue(formula, fields, { total: 100 })).toBeNull()
    expect(computeFormulaValue(formula, fields, { total: 'abc', worked: 1 })).toBeNull()
    expect(computeFormulaValue({ op: '-', a: { type: 'field', key: 'note' }, b: { type: 'field', key: 'worked' } }, fields, { note: 'x', worked: 1 })).toBeNull()
    expect(computeFormulaValue('not-a-formula', fields, {})).toBeNull()
    expect(computeFormulaValue(null, fields, {})).toBeNull()
  })

  test('computeFormulaValues: только formula-поля в результате', () => {
    const withFormulas = [
      ...fields,
      { key: 'double', type: 'formula' },
    ].map((field) => ({
      ...field,
      formula:
        field.key === 'left'
          ? { op: '-' as const, a: { type: 'field' as const, key: 'total' }, b: { type: 'field' as const, key: 'worked' } }
          : field.key === 'double'
            ? { op: '*' as const, a: { type: 'field' as const, key: 'total' }, b: { type: 'const' as const, value: 2 } }
            : undefined,
    }))
    expect(computeFormulaValues(withFormulas, { total: 10, worked: 4 })).toEqual({ left: 6, double: 20 })
  })

  test('formulaReferencesSatisfiable: только number-поля этого же реестра, не сам на себя', () => {
    const formula = { op: '-' as const, a: { type: 'field' as const, key: 'total' }, b: { type: 'field' as const, key: 'worked' } }
    expect(formulaReferencesSatisfiable(formula, fields, 'left')).toBe(true)
    expect(
      formulaReferencesSatisfiable(
        { op: '-', a: { type: 'field', key: 'note' }, b: { type: 'field', key: 'worked' } },
        fields,
        'left',
      ),
    ).toBe(false)
    expect(
      formulaReferencesSatisfiable(
        { op: '-', a: { type: 'field', key: 'total' }, b: { type: 'field', key: 'left' } },
        fields,
        'left',
      ),
    ).toBe(false)
    // Новое поле (ключа ещё нет в реестре): ссылается на существующие number-поля — можно.
    expect(formulaReferencesSatisfiable(formula, fields, 'new_field')).toBe(true)
  })
})
