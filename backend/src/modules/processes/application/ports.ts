import type { ProcessSide } from '@ordiks-survey/contracts'

import type { PrivateStorage } from '../../../storage/port'

/** Что сервисам процессов нужно от внешнего мира; `PrivateStorage` — нейтральный порт хранилища. */
export type { PrivateStorage }

export type Clock = {
  now(): Date
}

export type ProcessStepRow = {
  id: string
  processId: string
  side: ProcessSide
  title: string
  actorRole: string
  tools: string[]
  effect: string | null
  mapToStepId: string | null
  disappears: boolean
  sortOrder: number
}

export type ProcessSchemeRow = {
  side: ProcessSide
  objectKey: string
  fileName: string
  createdAt: Date
  updatedAt: Date
}

export type ProcessTreeRow = {
  id: string
  projectId: string
  name: string
  steps: ProcessStepRow[]
  schemes: ProcessSchemeRow[]
}

export type ProcessesRepository = {
  listProcesses(projectId: string): Promise<ProcessTreeRow[]>

  findProcessTreeById(processId: string): Promise<ProcessTreeRow | null>

  findProcessById(processId: string): Promise<{ id: string; projectId: string; name: string } | null>

  createProcess(projectId: string, name: string): Promise<{ id: string; projectId: string; name: string }>

  updateProcess(processId: string, name: string): Promise<{ id: string; projectId: string; name: string } | null>

  deleteProcess(processId: string): Promise<boolean>

  findStepById(stepId: string): Promise<ProcessStepRow | null>

  createStep(processId: string, input: StepWrite): Promise<ProcessStepRow>

  updateStep(stepId: string, data: Partial<StepWrite>): Promise<ProcessStepRow | null>

  deleteStep(stepId: string): Promise<boolean>

  /** Полная перестановка шагов стороны: присваивает sortOrder по порядку id. */
  reorderSteps(processId: string, side: ProcessSide, ids: string[]): Promise<number>

  /** Схема стороны процесса (одна на сторону). */
  findScheme(processId: string, side: ProcessSide): Promise<ProcessSchemeRow | null>

  upsertScheme(
    processId: string,
    side: ProcessSide,
    data: { objectKey: string; fileName: string },
  ): Promise<ProcessSchemeRow>

  deleteScheme(processId: string, side: ProcessSide): Promise<boolean>
}

/** Запись шага без id: tools нормализуются в репозитории при чтении. */
export type StepWrite = {
  side: ProcessSide
  title: string
  actorRole: string
  tools: string[]
  effect: string | null
  mapToStepId: string | null
  disappears: boolean
  sortOrder: number
}

export type ProcessSchemeUploadClaims = {
  processId: string
  side: ProcessSide
  objectKey: string
  contentType: string
  byteSize: number
  /// Unix-секунды, когда тикет перестаёт приниматься.
  expiresAt: number
}

/**
 * Самоподписанный тикет загрузки схемы (как у файлов фактов): подтверждение проверяет
 * подпись, а не доверяет присланным objectKey/размеру.
 */
export type ProcessSchemeUploadTokens = {
  issue(claims: ProcessSchemeUploadClaims): string
  verify(processId: string, side: ProcessSide, token: string, now: Date): ProcessSchemeUploadClaims | null
}
