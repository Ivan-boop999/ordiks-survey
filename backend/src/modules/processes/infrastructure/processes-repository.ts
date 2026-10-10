import type { ProcessSide } from '@ordiks-survey/contracts'

import type { DbClient } from '../../../db'
import { Prisma } from '../../../generated/prisma/client'
import type {
  ProcessSchemeRow,
  ProcessStepRow,
  ProcessTreeRow,
  ProcessesRepository,
  StepWrite,
} from '../application/ports'

const stepOrder = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }]

const treeInclude = {
  steps: { orderBy: stepOrder },
  schemes: { orderBy: { side: 'asc' as const } },
} as const

function toolsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
}

function toStepRow(row: {
  id: string
  processId: string
  side: string
  title: string
  actorRole: string
  tools: unknown
  effect: string | null
  mapToStepId: string | null
  disappears: boolean
  sortOrder: number
}): ProcessStepRow {
  return {
    id: row.id,
    processId: row.processId,
    side: row.side as ProcessSide,
    title: row.title,
    actorRole: row.actorRole,
    tools: toolsOf(row.tools),
    effect: row.effect,
    mapToStepId: row.mapToStepId,
    disappears: row.disappears,
    sortOrder: row.sortOrder,
  }
}

function toTreeRow(row: {
  id: string
  projectId: string
  name: string
  steps: Parameters<typeof toStepRow>[0][]
  schemes: Array<{ side: string; objectKey: string; fileName: string; createdAt: Date; updatedAt: Date }>
}): ProcessTreeRow {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    steps: row.steps.map(toStepRow),
    schemes: row.schemes.map(
      (scheme): ProcessSchemeRow => ({
        side: scheme.side as ProcessSide,
        objectKey: scheme.objectKey,
        fileName: scheme.fileName,
        createdAt: scheme.createdAt,
        updatedAt: scheme.updatedAt,
      }),
    ),
  }
}

export function createPrismaProcessesRepository(db: DbClient): ProcessesRepository {
  return {
    listProcesses(projectId) {
      return db.process
        .findMany({ where: { projectId }, include: treeInclude, orderBy: { id: 'asc' } })
        .then((rows) => rows.map(toTreeRow))
    },

    findProcessTreeById(processId) {
      return db.process
        .findUnique({ where: { id: processId }, include: treeInclude })
        .then((row) => (row ? toTreeRow(row) : null))
    },

    findProcessById(processId) {
      return db.process.findUnique({
        where: { id: processId },
        select: { id: true, projectId: true, name: true },
      })
    },

    createProcess(projectId, name) {
      return db.process.create({ data: { projectId, name }, select: { id: true, projectId: true, name: true } })
    },

    updateProcess(processId, name) {
      return db.process
        .update({ where: { id: processId }, data: { name }, select: { id: true, projectId: true, name: true } })
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteProcess(processId) {
      return db.process
        .delete({ where: { id: processId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    findStepById(stepId) {
      return db.processStep.findUnique({ where: { id: stepId } }).then((row) => (row ? toStepRow(row) : null))
    },

    createStep(processId, input: StepWrite) {
      return db.processStep
        .create({
          data: {
            processId,
            side: input.side,
            title: input.title,
            actorRole: input.actorRole,
            tools: input.tools,
            effect: input.effect,
            mapToStepId: input.mapToStepId,
            disappears: input.disappears,
            sortOrder: input.sortOrder,
          },
        })
        .then(toStepRow)
    },

    updateStep(stepId, data) {
      return db.processStep
        .update({ where: { id: stepId }, data })
        .then(toStepRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteStep(stepId) {
      return db.processStep
        .delete({ where: { id: stepId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    async reorderSteps(processId, side: ProcessSide, ids) {
      // Полная перестановка в одной транзакции: sortOrder = позиция в списке id.
      await db.$transaction(
        ids.map((id, position) =>
          db.processStep.updateMany({ where: { id, processId, side }, data: { sortOrder: position } }),
        ),
      )
      const count = await db.processStep.count({ where: { processId, side } })
      return count
    },

    findScheme(processId, side: ProcessSide) {
      return db.processScheme
        .findUnique({ where: { processId_side: { processId, side } } })
        .then((row) => (row ? toSchemeRow(row) : null))
    },

    async upsertScheme(processId, side: ProcessSide, data) {
      const row = await db.processScheme.upsert({
        where: { processId_side: { processId, side } },
        create: { processId, side, objectKey: data.objectKey, fileName: data.fileName },
        update: { objectKey: data.objectKey, fileName: data.fileName },
      })
      return toSchemeRow(row)
    },

    deleteScheme(processId, side: ProcessSide) {
      return db.processScheme
        .delete({ where: { processId_side: { processId, side } } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },
  }
}

function toSchemeRow(row: {
  side: string
  objectKey: string
  fileName: string
  createdAt: Date
  updatedAt: Date
}): ProcessSchemeRow {
  return {
    side: row.side as ProcessSide,
    objectKey: row.objectKey,
    fileName: row.fileName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function isRecordNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}
