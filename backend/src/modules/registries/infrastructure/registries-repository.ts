import { projectSettingsSchema, type ProjectSettings } from '@ordiks-survey/contracts'

import type { DbClient } from '../../../db'
import { Prisma } from '../../../generated/prisma/client'
import type {
  AnalyticsRepository,
  CustomFieldRow,
  CustomRegistryRow,
  RegistriesRepository,
  RegistryEntryRow,
  RegistryStatusRow,
} from '../application/ports'

const orderById = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }]

const registryTreeInclude = {
  fields: { orderBy: orderById },
  statuses: { orderBy: orderById },
} as const

function stringsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
}

function valuesOf(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
}

function toFieldRow(row: {
  id: string
  registryId: string
  key: string
  name: string
  type: string
  options: unknown
  formula: unknown
  sortOrder: number
}): CustomFieldRow {
  return {
    id: row.id,
    registryId: row.registryId,
    key: row.key,
    name: row.name,
    type: row.type,
    options: stringsOf(row.options),
    formula: row.formula,
    sortOrder: row.sortOrder,
  }
}

function toStatusRow(row: {
  id: string
  registryId: string
  name: string
  color: string
  sortOrder: number
}): RegistryStatusRow {
  return { id: row.id, registryId: row.registryId, name: row.name, color: row.color, sortOrder: row.sortOrder }
}

function toEntryRow(row: {
  id: string
  registryId: string
  statusId: string | null
  values: unknown
  createdAt: Date
  updatedAt: Date
}): RegistryEntryRow {
  return {
    id: row.id,
    registryId: row.registryId,
    statusId: row.statusId,
    values: valuesOf(row.values),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toRegistryRow(row: {
  id: string
  projectId: string
  name: string
  description: string
  fields: Parameters<typeof toFieldRow>[0][]
  statuses: Parameters<typeof toStatusRow>[0][]
}): CustomRegistryRow {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    fields: row.fields.map(toFieldRow),
    statuses: row.statuses.map(toStatusRow),
  }
}

export function createPrismaRegistriesRepository(db: DbClient): RegistriesRepository {
  return {
    listRegistries(projectId) {
      return db.customRegistry
        .findMany({ where: { projectId }, include: registryTreeInclude, orderBy: { id: 'asc' } })
        .then((rows) => rows.map(toRegistryRow))
    },

    findRegistryTree(registryId) {
      return db.customRegistry
        .findUnique({ where: { id: registryId }, include: registryTreeInclude })
        .then((row) => (row ? toRegistryRow(row) : null))
    },

    findRegistryById(registryId) {
      return db.customRegistry.findUnique({
        where: { id: registryId },
        select: { id: true, projectId: true, name: true },
      })
    },

    createRegistry(projectId, input) {
      return db.customRegistry.create({ data: { projectId, ...input }, select: { id: true } })
    },

    updateRegistry(registryId, data) {
      return db.customRegistry
        .update({ where: { id: registryId }, data })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    deleteRegistry(registryId) {
      return db.customRegistry
        .delete({ where: { id: registryId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    findFieldById(fieldId) {
      return db.customField.findUnique({ where: { id: fieldId } }).then((row) => (row ? toFieldRow(row) : null))
    },

    createField(registryId, input) {
      return db.customField
        .create({
          data: {
            registryId,
            key: input.key,
            name: input.name,
            type: input.type,
            options: input.options,
            formula: jsonOrNull(input.formula),
            sortOrder: input.sortOrder,
          },
        })
        .then(toFieldRow)
    },

    updateField(fieldId, data) {
      return db.customField
        .update({
          where: { id: fieldId },
          data: {
            ...(data.key !== undefined ? { key: data.key } : {}),
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.type !== undefined ? { type: data.type } : {}),
            ...(data.options !== undefined ? { options: data.options } : {}),
            ...(data.formula !== undefined ? { formula: jsonOrNull(data.formula) } : {}),
            ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          },
        })
        .then(toFieldRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteField(fieldId) {
      return db.customField
        .delete({ where: { id: fieldId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    async deleteFieldWithValues(fieldId) {
      return db
        .$transaction(async (tx) => {
          const field = await tx.customField.findUnique({ where: { id: fieldId }, select: { registryId: true, key: true } })
          if (!field) return false
          await tx.customField.delete({ where: { id: fieldId } })
          // Чистим ключ из values каждой записи: JSON перезаписывается целиком.
          const entries = await tx.registryEntry.findMany({
            where: { registryId: field.registryId },
            select: { id: true, values: true },
          })
          for (const entry of entries) {
            const values = valuesOf(entry.values)
            if (!(field.key in values)) continue
            const next = { ...values }
            delete next[field.key]
            await tx.registryEntry.update({ where: { id: entry.id }, data: { values: next as Prisma.InputJsonValue } })
          }
          return true
        })
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    findStatusById(statusId) {
      return db.registryStatus.findUnique({ where: { id: statusId } }).then((row) => (row ? toStatusRow(row) : null))
    },

    createStatus(registryId, input) {
      return db.registryStatus.create({ data: { registryId, ...input } }).then(toStatusRow)
    },

    updateStatus(statusId, data) {
      return db.registryStatus
        .update({ where: { id: statusId }, data })
        .then(toStatusRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    async deleteStatusWithMove(statusId) {
      return db
        .$transaction(async (tx) => {
          const status = await tx.registryStatus.findUnique({
            where: { id: statusId },
            select: { id: true, registryId: true, sortOrder: true },
          })
          if (!status) return null
          // Первый оставшийся статус (по sortOrder) принимает записи удаляемого.
          const remaining = await tx.registryStatus.findFirst({
            where: { registryId: status.registryId, id: { not: statusId } },
            orderBy: orderById,
            select: { id: true },
          })
          const moved = await tx.registryEntry.updateMany({
            where: { statusId },
            data: { statusId: remaining?.id ?? null },
          })
          await tx.registryStatus.delete({ where: { id: statusId } })
          return { movedTo: remaining?.id ?? null, movedCount: moved.count }
        })
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    listEntries(registryId) {
      return db.registryEntry
        .findMany({ where: { registryId }, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] })
        .then((rows) => rows.map(toEntryRow))
    },

    findEntryById(entryId) {
      return db.registryEntry.findUnique({ where: { id: entryId } }).then((row) => (row ? toEntryRow(row) : null))
    },

    createEntry(registryId, input) {
      return db.registryEntry
        .create({ data: { registryId, statusId: input.statusId, values: input.values as Prisma.InputJsonValue } })
        .then(toEntryRow)
    },

    updateEntry(entryId, data) {
      return db.registryEntry
        .update({
          where: { id: entryId },
          data: {
            ...(data.values !== undefined ? { values: data.values as Prisma.InputJsonValue } : {}),
            statusId: data.statusId,
          },
        })
        .then(toEntryRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteEntry(entryId) {
      return db.registryEntry
        .delete({ where: { id: entryId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    bulkUpdateEntryStatus(registryId, ids, statusId) {
      return db.registryEntry
        .updateMany({ where: { id: { in: ids }, registryId }, data: { statusId } })
        .then((result) => result.count)
    },

    bulkDeleteEntries(registryId, ids) {
      return db.registryEntry
        .deleteMany({ where: { id: { in: ids }, registryId } })
        .then((result) => result.count)
    },

    createEntries(registryId, entries) {
      return db
        .$transaction(async (tx) => {
          for (const entry of entries) {
            await tx.registryEntry.create({
              data: {
                registryId,
                statusId: entry.statusId,
                values: entry.values as Prisma.InputJsonValue,
              },
            })
          }
          return entries.length
        })
    },
  }
}

export function createPrismaAnalyticsRepository(db: DbClient): AnalyticsRepository {
  const analyticsCommon = {
    findDomainById(domainId: string) {
      return db.domain.findUnique({ where: { id: domainId }, select: { id: true, projectId: true } })
    },
    findFindingByIdForProject(projectId: string, findingId: string) {
      return db.finding
        .findUnique({ where: { id: findingId }, select: { id: true, projectId: true } })
        .then((row) => (row && row.projectId === projectId ? { id: row.id } : null))
    },
    findMemberRole(projectId: string, userId: string) {
      return db.projectMember
        .findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } })
        .then((row) => row?.role ?? null)
    },
  }

  return {
    ...analyticsCommon,

    // GAP
    listGaps(projectId) {
      return db.gap.findMany({ where: { projectId }, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] })
    },
    createGap(input) {
      return db.gap.create({ data: input })
    },
    findGapById(gapId) {
      return db.gap.findUnique({ where: { id: gapId } })
    },
    updateGap(gapId, data) {
      return db.gap.update({ where: { id: gapId }, data }).catch((error: unknown) => { if (isRecordNotFound(error)) return null; throw error })
    },
    deleteGap(gapId) {
      return db.gap.delete({ where: { id: gapId } }).then(() => true).catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    // Риски
    listRisks(projectId) {
      return db.risk.findMany({
        where: { projectId },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      })
    },
    createRisk(input) {
      return db.risk.create({ data: input })
    },
    findRiskById(riskId) {
      return db.risk.findUnique({ where: { id: riskId } })
    },
    updateRisk(riskId, data) {
      return db.risk.update({ where: { id: riskId }, data }).catch((error: unknown) => { if (isRecordNotFound(error)) return null; throw error })
    },
    deleteRisk(riskId) {
      return db.risk.delete({ where: { id: riskId } }).then(() => true).catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    // Требования
    listRequirements(projectId) {
      return db.requirement.findMany({
        where: { projectId },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      })
    },
    createRequirement(input) {
      return db.requirement.create({ data: input })
    },
    findRequirementById(requirementId) {
      return db.requirement.findUnique({ where: { id: requirementId } })
    },
    updateRequirement(requirementId, data) {
      return db.requirement.update({ where: { id: requirementId }, data }).catch((error: unknown) => { if (isRecordNotFound(error)) return null; throw error })
    },
    deleteRequirement(requirementId) {
      return db.requirement.delete({ where: { id: requirementId } }).then(() => true).catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    // Решения
    listDecisions(projectId) {
      return db.decisionLog.findMany({
        where: { projectId },
        orderBy: [{ decidedAt: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'asc' as const }],
      })
    },
    createDecision(input) {
      return db.decisionLog.create({ data: input })
    },
    findDecisionById(decisionId) {
      return db.decisionLog.findUnique({ where: { id: decisionId } })
    },
    updateDecision(decisionId, data) {
      return db.decisionLog.update({ where: { id: decisionId }, data }).catch((error: unknown) => { if (isRecordNotFound(error)) return null; throw error })
    },
    deleteDecision(decisionId) {
      return db.decisionLog.delete({ where: { id: decisionId } }).then(() => true).catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    // Коммуникации
    listCommunications(projectId) {
      return db.communication.findMany({
        where: { projectId },
        orderBy: [{ heldAt: 'desc' as const }, { id: 'asc' as const }],
      })
    },
    createCommunication(input) {
      return db.communication.create({ data: input })
    },
    findCommunicationById(communicationId) {
      return db.communication.findUnique({ where: { id: communicationId } })
    },
    updateCommunication(communicationId, data) {
      return db.communication.update({ where: { id: communicationId }, data }).catch((error: unknown) => { if (isRecordNotFound(error)) return null; throw error })
    },
    deleteCommunication(communicationId) {
      return db.communication.delete({ where: { id: communicationId } }).then(() => true).catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    // Quick wins
    listQuickWins(projectId) {
      return db.quickWin.findMany({
        where: { projectId },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      })
    },
    createQuickWin(input) {
      return db.quickWin.create({ data: input })
    },
    findQuickWinById(quickWinId) {
      return db.quickWin.findUnique({ where: { id: quickWinId } })
    },
    updateQuickWin(quickWinId, data) {
      return db.quickWin.update({ where: { id: quickWinId }, data }).catch((error: unknown) => { if (isRecordNotFound(error)) return null; throw error })
    },
    deleteQuickWin(quickWinId) {
      return db.quickWin.delete({ where: { id: quickWinId } }).then(() => true).catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    // Базлайн
    listBaselines(projectId) {
      return db.baseline.findMany({
        where: { projectId },
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      })
    },
    createBaseline(input) {
      return db.baseline.create({ data: input })
    },
    findBaselineById(baselineId) {
      return db.baseline.findUnique({ where: { id: baselineId } })
    },
    updateBaseline(baselineId, data) {
      return db.baseline.update({ where: { id: baselineId }, data }).catch((error: unknown) => { if (isRecordNotFound(error)) return null; throw error })
    },
    deleteBaseline(baselineId) {
      return db.baseline.delete({ where: { id: baselineId } }).then(() => true).catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },
  }
}

/** Settings для автовставок отчёта: читаются той же схемой, мусор в JSON не роняет чтение. */
export function parseProjectSettings(raw: unknown): ProjectSettings {
  const result = projectSettingsSchema.safeParse(raw ?? {})
  return result.success ? result.data : projectSettingsSchema.parse({})
}

function isRecordNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}

/**
 * Запись nullable-JSON: Prisma различает SQL NULL и JSON null, поэтому пустая формула
 * пишется явным DbNull (читается как null), объект — как InputJsonValue.
 */
function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) return Prisma.DbNull
  return value as Prisma.InputJsonValue
}

/** Обёртка update-методов: P2025 (строки нет) → null, прочее — пробрасываем. */
async function withNotFoundAsNull<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation()
  } catch (error) {
    if (isRecordNotFound(error)) return null
    throw error
  }
}
