import {
  registryFormulaSchema,
  type RegistryDto,
  type RegistryEntryDto,
  type RegistryFieldDto,
  type RegistryStatusDto,
  type RegistryFormula,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import {
  computeFormulaValues,
  formulaReferencesSatisfiable,
} from '../domain/formula'
import {
  findStatusIdByName,
  normalizeImportCell,
  parseImportText,
  type ImportField,
} from '../domain/import'
import { RegistriesFailure } from '../domain/errors'
import type {
  CustomRegistryRow,
  RegistriesRepository,
  RegistryEntryRow,
} from './ports'

type CustomRegistriesServiceDependencies = {
  guard: ProjectAccessGuard
  repository: RegistriesRepository
}

/**
 * Пользовательские реестры: конструктор (поля text/number/date/select/formula, статусы
 * с цветом палитры), записи с валидацией типов, массовые операции, поиск и импорт из текста.
 * Формулы не хранят значений: вычисляются при выдаче записей. Команда редактирует, все роли
 * проекта читают.
 */
export class CustomRegistriesService {
  constructor(private readonly dependencies: CustomRegistriesServiceDependencies) {}

  async listRegistries(principal: AuthenticatedPrincipal, projectId: string) {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listRegistries(projectId)).map(registryDto)
  }

  async createRegistry(principal: AuthenticatedPrincipal, projectId: string, input: { name: string; description: string }) {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const created = await this.dependencies.repository.createRegistry(projectId, input)
    return this.getRegistry(principal, created.id)
  }

  async getRegistry(principal: AuthenticatedPrincipal, registryId: string) {
    const registry = await this.findTree(registryId)
    await this.dependencies.guard.requireView(principal.id, registry.projectId)
    return registryDto(registry)
  }

  async updateRegistry(principal: AuthenticatedPrincipal, registryId: string, input: { name?: string; description?: string }) {
    const registry = await this.findTree(registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    await this.dependencies.repository.updateRegistry(registryId, input)
    return this.getRegistry(principal, registryId)
  }

  async deleteRegistry(principal: AuthenticatedPrincipal, registryId: string) {
    const registry = await this.findTree(registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    await this.dependencies.repository.deleteRegistry(registryId)
  }

  // --------------------------------------------------------
  // Поля
  // --------------------------------------------------------

  async createField(
    principal: AuthenticatedPrincipal,
    registryId: string,
    input: {
      key: string
      name: string
      type: string
      options: string[]
      formula?: RegistryFormula | null | undefined
      sortOrder?: number
    },
  ) {
    const registry = await this.findTree(registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    this.assertFieldWrite(registry, input, null)

    await this.dependencies.repository.createField(registryId, {
      key: input.key,
      name: input.name,
      type: input.type,
      options: input.type === 'select' ? input.options : [],
      formula: input.type === 'formula' ? (input.formula ?? null) : null,
      sortOrder: input.sortOrder ?? registry.fields.length,
    })
    return this.getRegistry(principal, registryId)
  }

  async updateField(
    principal: AuthenticatedPrincipal,
    fieldId: string,
    input: {
      key?: string
      name?: string
      type?: string
      options?: string[]
      formula?: RegistryFormula | null | undefined
      sortOrder?: number
    },
  ) {
    const field = await this.findField(fieldId)
    const registry = await this.findTree(field.registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)

    const merged = {
      key: input.key ?? field.key,
      name: input.name ?? field.name,
      type: input.type ?? field.type,
      options: input.options ?? field.options,
      formula: input.formula === undefined ? field.formula : input.formula,
    }
    this.assertFieldWrite(registry, merged, field.key)

    await this.dependencies.repository.updateField(fieldId, {
      ...merged,
      options: merged.type === 'select' ? merged.options : [],
      formula: merged.type === 'formula' ? merged.formula : null,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    })
    return this.getRegistry(principal, field.registryId)
  }

  /** Удаление поля чистит его ключ из values всех записей реестра. */
  async deleteField(principal: AuthenticatedPrincipal, fieldId: string) {
    const field = await this.findField(fieldId)
    const registry = await this.findTree(field.registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    await this.dependencies.repository.deleteFieldWithValues(fieldId)
  }

  // --------------------------------------------------------
  // Статусы
  // --------------------------------------------------------

  async createStatus(
    principal: AuthenticatedPrincipal,
    registryId: string,
    input: { name: string; color: string; sortOrder?: number },
  ) {
    const registry = await this.findTree(registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    await this.dependencies.repository.createStatus(registryId, {
      name: input.name,
      color: input.color,
      sortOrder: input.sortOrder ?? registry.statuses.length,
    })
    return this.getRegistry(principal, registryId)
  }

  async updateStatus(
    principal: AuthenticatedPrincipal,
    statusId: string,
    input: { name?: string; color?: string; sortOrder?: number },
  ) {
    const status = await this.findStatus(statusId)
    const registry = await this.findTree(status.registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    await this.dependencies.repository.updateStatus(statusId, input)
    return this.getRegistry(principal, status.registryId)
  }

  /**
   * Удаление статуса в использовании: записи переезжают на первый оставшийся статус
   * (sortOrder), ответ сообщает, куда и сколько; записей на статусе нет — просто удаление.
   */
  async deleteStatus(principal: AuthenticatedPrincipal, statusId: string) {
    const status = await this.findStatus(statusId)
    const registry = await this.findTree(status.registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    const result = await this.dependencies.repository.deleteStatusWithMove(statusId)
    if (!result) throw new RegistriesFailure('not_found', 'Registry status not found')
    return result
  }

  // --------------------------------------------------------
  // Записи
  // --------------------------------------------------------

  async listEntries(
    principal: AuthenticatedPrincipal,
    registryId: string,
    query: { statusId?: string; q?: string },
  ) {
    const registry = await this.findTree(registryId)
    await this.dependencies.guard.requireView(principal.id, registry.projectId)
    return (await this.dependencies.repository.listEntries(registryId))
      .filter((entry) => (query.statusId === undefined ? true : entry.statusId === query.statusId))
      .filter((entry) => {
        if (query.q === undefined) return true
        const needle = query.q.toLowerCase()
        return Object.values(entry.values).some((value) => String(value).toLowerCase().includes(needle))
      })
      .map((entry) => entryDto(entry, registry.fields))
  }

  async createEntry(principal: AuthenticatedPrincipal, registryId: string, input: { values: Record<string, string | number>; statusId?: string | null }) {
    const registry = await this.findTree(registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    const values = this.validateEntryValues(registry, input.values)
    const statusId = await this.resolveStatus(registry, input.statusId ?? null)
    const created = await this.dependencies.repository.createEntry(registryId, { values, statusId })
    return entryDto(created, registry.fields)
  }

  async updateEntry(principal: AuthenticatedPrincipal, entryId: string, input: { values?: Record<string, string | number>; statusId?: string | null }) {
    const entry = await this.findEntry(entryId)
    const registry = await this.findTree(entry.registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)

    const values = input.values === undefined ? entry.values : this.validateEntryValues(registry, input.values)
    const statusId =
      input.statusId === undefined ? entry.statusId : await this.resolveStatus(registry, input.statusId)
    const updated = await this.dependencies.repository.updateEntry(entryId, { values, statusId })
    return entryDto(updated ?? entry, registry.fields)
  }

  async deleteEntry(principal: AuthenticatedPrincipal, entryId: string) {
    const entry = await this.findEntry(entryId)
    const registry = await this.findTree(entry.registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    await this.dependencies.repository.deleteEntry(entryId)
  }

  async bulkUpdateStatus(principal: AuthenticatedPrincipal, registryId: string, ids: string[], statusId: string) {
    const registry = await this.findTree(registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    await this.resolveStatus(registry, statusId)
    const updated = await this.dependencies.repository.bulkUpdateEntryStatus(registryId, ids, statusId)
    return { updated }
  }

  async bulkDelete(principal: AuthenticatedPrincipal, registryId: string, ids: string[]) {
    const registry = await this.findTree(registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)
    const deleted = await this.dependencies.repository.bulkDeleteEntries(registryId, ids)
    return { deleted }
  }

  // --------------------------------------------------------
  // Импорт из текста
  // --------------------------------------------------------

  /**
   * Импорт: разделитель таб или «;», даты дд.мм.гггг → ISO, select канонизируется; строки
   * с ошибками типов пропускаются с отчётом {line, reason}. Один пакет — одна транзакция.
   */
  async importEntries(
    principal: AuthenticatedPrincipal,
    registryId: string,
    input: {
      text: string
      hasHeader: boolean
      mapping: Record<string, string>
      statusId?: string
    },
  ) {
    const registry = await this.findTree(registryId)
    await this.dependencies.guard.requireEdit(principal.id, registry.projectId)

    const importable = registry.fields.filter((field) => field.type !== 'formula')
    const fieldsByKey = new Map(importable.map((field) => [field.key, field]))
    // Цели маппинга: ключи полей (без формул) или 'status'; 'skip' и мусор — колонка молча игнорируется.
    const targets = new Map<number, { kind: 'field'; key: string } | { kind: 'status' }>()
    for (const [col, target] of Object.entries(input.mapping)) {
      const index = Number(col)
      if (!Number.isInteger(index) || index < 0) continue
      if (target === 'status') targets.set(index, { kind: 'status' })
      else if (fieldsByKey.has(target)) targets.set(index, { kind: 'field', key: target })
    }
    if (targets.size === 0) {
      throw new RegistriesFailure('invalid', 'Mapping has no columns assigned to registry fields or status')
    }

    const fallbackStatus =
      (await this.resolveStatus(registry, input.statusId ?? null)) ??
      registry.statuses.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id ??
      null

    const { dataRows } = parseImportText(input.text, input.hasHeader)
    const batch: Array<{ values: Record<string, unknown>; statusId: string | null }> = []
    const skipped: Array<{ line: number; reason: string }> = []
    let defaultStatus = 0

    for (const [rowIndex, cells] of dataRows.entries()) {
      const values: Record<string, unknown> = {}
      let statusId: string | null | undefined
      const errors: string[] = []

      for (const [index, target] of targets) {
        const raw = cells[index] ?? ''
        if (target.kind === 'status') {
          const matched = findStatusIdByName(registry.statuses, raw)
          if (matched !== null) statusId = matched
          else if (raw !== '') defaultStatus += 1
          continue
        }
        const field = fieldsByKey.get(target.key)!
        const result = normalizeImportCell(
          { key: field.key, name: field.name, type: field.type as ImportField['type'], options: field.options },
          raw,
        )
        if (!result.ok) {
          errors.push(`${field.name}: ${result.error}`)
          continue
        }
        if (result.value !== '') values[field.key] = result.value
      }

      if (errors.length > 0) {
        skipped.push({ line: rowIndex + 1, reason: errors.join('; ') })
        continue
      }
      batch.push({ values, statusId: statusId ?? fallbackStatus })
    }

    const created = batch.length > 0 ? await this.dependencies.repository.createEntries(registryId, batch) : 0
    return { created, skipped, defaultStatus }
  }

  // --------------------------------------------------------
  // Валидации
  // --------------------------------------------------------

  /** Ключ уникален в реестре; formula обязательна для formula-полей и ссылается на number-поля. */
  private assertFieldWrite(
    registry: CustomRegistryRow,
    input: { key: string; name: string; type: string; options: string[]; formula?: unknown },
    previousKey: string | null,
  ) {
    const duplicate = registry.fields.find(
      (field) => field.key === input.key && field.key !== previousKey,
    )
    if (duplicate) throw new RegistriesFailure('invalid', `Field key "${input.key}" already exists in this registry`)

    if (input.type === 'select' && input.options.length === 0) {
      throw new RegistriesFailure('invalid', 'Select field requires at least one option')
    }
    if (input.type !== 'select' && input.options.length > 0) {
      throw new RegistriesFailure('invalid', 'Options are only allowed for select fields')
    }
    if (input.type !== 'formula') return

    const parsed = registryFormulaSchema.safeParse(input.formula)
    if (!parsed.success) throw new RegistriesFailure('invalid', 'Formula field requires a valid formula')
    // Ссылки — на number-поля этого же реестра (новое поле ссылаться само на себя не может).
    const peers = registry.fields
      .filter((field) => field.key !== previousKey)
      .map((field) => ({ key: field.key, type: field.type }))
    const candidate = [...peers, { key: input.key, type: input.type }]
    if (!formulaReferencesSatisfiable(parsed.data, candidate, input.key)) {
      throw new RegistriesFailure('invalid', 'Formula operands must reference number fields of this registry')
    }
  }

  /** values: ключи — поля реестра (formula запрещены), типы значений сверяются с полями. */
  private validateEntryValues(registry: CustomRegistryRow, values: Record<string, string | number>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(values)) {
      const field = registry.fields.find((candidate) => candidate.key === key)
      if (!field) throw new RegistriesFailure('invalid', `Unknown field "${key}" in entry values`)
      if (field.type === 'formula') {
        throw new RegistriesFailure('invalid', `Field "${key}" is computed; its value cannot be stored`)
      }
      const normalized = normalizeImportCell(
        { key: field.key, name: field.name, type: field.type as ImportField['type'], options: field.options },
        String(raw ?? ''),
      )
      if (!normalized.ok) throw new RegistriesFailure('invalid', `${field.name}: ${normalized.error}`)
      if (normalized.value !== '') result[key] = normalized.value
    }
    return result
  }

  private async resolveStatus(registry: CustomRegistryRow, statusId: string | null | undefined): Promise<string | null> {
    if (statusId == null || statusId === undefined) return null
    const status = registry.statuses.find((candidate) => candidate.id === statusId)
    if (!status) throw new RegistriesFailure('invalid', 'Status does not belong to this registry')
    return status.id
  }

  private async findTree(registryId: string): Promise<CustomRegistryRow> {
    const registry = await this.dependencies.repository.findRegistryTree(registryId)
    if (!registry) throw new RegistriesFailure('not_found', 'Registry not found')
    return registry
  }

  private async findField(fieldId: string) {
    const field = await this.dependencies.repository.findFieldById(fieldId)
    if (!field) throw new RegistriesFailure('not_found', 'Registry field not found')
    return field
  }

  private async findStatus(statusId: string) {
    const status = await this.dependencies.repository.findStatusById(statusId)
    if (!status) throw new RegistriesFailure('not_found', 'Registry status not found')
    return status
  }

  private async findEntry(entryId: string): Promise<RegistryEntryRow> {
    const entry = await this.dependencies.repository.findEntryById(entryId)
    if (!entry) throw new RegistriesFailure('not_found', 'Registry entry not found')
    return entry
  }
}

export function registryDto(row: CustomRegistryRow): RegistryDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    fields: row.fields.map((field) => ({
      id: field.id,
      registryId: field.registryId,
      key: field.key,
      name: field.name,
      type: field.type as RegistryFieldDto['type'],
      options: field.options,
      formula: formulaDto(field.formula),
      sortOrder: field.sortOrder,
    })),
    statuses: row.statuses.map((status) => ({
      id: status.id,
      registryId: status.registryId,
      name: status.name,
      color: status.color as RegistryStatusDto['color'],
      sortOrder: status.sortOrder,
    })),
  }
}

/// Формула хранится как JSON: при выдаче перепроверяем схемой, мусор становится null.
function formulaDto(formula: unknown): RegistryFieldDto['formula'] {
  const parsed = registryFormulaSchema.safeParse(formula)
  return parsed.success ? parsed.data : null
}

export function entryDto(
  row: RegistryEntryRow,
  fields: Array<{ key: string; type: string; formula?: unknown }>,
): RegistryEntryDto {
  const values: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(row.values ?? {})) {
    if (typeof value === 'number') values[key] = value
    else if (typeof value === 'string') values[key] = value
  }
  return {
    id: row.id,
    registryId: row.registryId,
    statusId: row.statusId,
    values,
    computed: computeFormulaValues(fields, row.values ?? {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
