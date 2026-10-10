import { registryFormulaSchema, type RegistryFormula } from '@ordiks-survey/contracts'

/** Поле реестра, как его видит вычислитель формул. */
export type FormulaField = {
  key: string
  type: string
}

function operandValue(
  operand: RegistryFormula['a'],
  fields: FormulaField[],
  values: Record<string, unknown>,
): number | null {
  if (operand.type === 'const') return Number.isFinite(operand.value) ? operand.value : null
  const field = fields.find((candidate) => candidate.key === operand.key)
  // Формулы считаются только над number-полями; ссылка на другое формульное поле запрещена.
  if (!field || field.type !== 'number') return null
  const raw = values[operand.key]
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * Вычисление формульного поля реестра: a op b над number-полями этой же записи. Значения не
 * хранятся — считаются при выдаче (DTO) и в автовставке реестра в отчёт. Любой пустой или
 * нечисловой операнд, битая ссылка на поле или невалидная формула дают null («—»).
 */
export function computeFormulaValue(
  formula: unknown,
  fields: FormulaField[],
  values: Record<string, unknown>,
): number | null {
  const parsed = registryFormulaSchema.safeParse(formula)
  if (!parsed.success) return null
  const a = operandValue(parsed.data.a, fields, values)
  const b = operandValue(parsed.data.b, fields, values)
  if (a === null || b === null) return null
  switch (parsed.data.op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    default:
      return null
  }
}

/** Вычислить все formula-поля записи: {fieldKey: number|null}. */
export function computeFormulaValues(
  fields: Array<FormulaField & { formula?: unknown }>,
  values: Record<string, unknown>,
): Record<string, number | null> {
  const computed: Record<string, number | null> = {}
  for (const field of fields) {
    if (field.type !== 'formula') continue
    computed[field.key] = computeFormulaValue(field.formula, fields, values)
  }
  return computed
}

/** Формула валидна по ссылке: операнды-field указывают на number-поля этого же реестра. */
export function formulaReferencesSatisfiable(
  formula: RegistryFormula,
  fields: Array<FormulaField & { key: string }>,
  ownKey: string,
): boolean {
  for (const operand of [formula.a, formula.b]) {
    if (operand.type !== 'field') continue
    if (operand.key === ownKey) return false
    const target = fields.find((candidate) => candidate.key === operand.key)
    if (!target || target.type !== 'number') return false
  }
  return true
}
