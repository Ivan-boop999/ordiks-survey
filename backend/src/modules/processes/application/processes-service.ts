import type {
  ConfirmProcessSchemeUploadRequest,
  CreateProcessRequest,
  CreateProcessSchemeUploadRequest,
  CreateProcessSchemeUploadResponse,
  CreateProcessStepRequest,
  ProcessDto,
  ProcessSchemeDownload,
  ProcessSide,
  ReorderProcessStepsRequest,
  UpdateProcessRequest,
  UpdateProcessStepRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import { ProcessesFailure } from '../domain/errors'
import type {
  Clock,
  ProcessSchemeUploadTokens,
  ProcessesRepository,
  PrivateStorage,
  ProcessStepRow,
  ProcessTreeRow,
} from './ports'

type ProcessesServiceDependencies = {
  clock: Clock
  guard: ProjectAccessGuard
  repository: ProcessesRepository
  storage: PrivateStorage
  tokens: ProcessSchemeUploadTokens
  /// Ключ объекта схемы: projects/{projectId}/processes/{processId}/{side}/{uuid}.
  createObjectKey: (projectId: string, processId: string, side: ProcessSide) => string
  /** Удаления, которые не должны ронять основной запрос. */
  deferDelete: (objectKey: string) => void
}

/**
 * Процессы AS-IS/TO-BE: CRUD процессов и шагов, переупорядочивание, схемы StormBPMN
 * (signed upload + confirm + download). Команда редактирует, все роли проекта читают.
 */
export class ProcessesService {
  constructor(private readonly dependencies: ProcessesServiceDependencies) {}

  async listProcesses(principal: AuthenticatedPrincipal, projectId: string): Promise<ProcessDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listProcesses(projectId)).map(processDto)
  }

  async createProcess(principal: AuthenticatedPrincipal, projectId: string, input: CreateProcessRequest): Promise<ProcessDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const row = await this.dependencies.repository.createProcess(projectId, input.name)
    return processDto({ ...row, steps: [], schemes: [] })
  }

  async getProcess(principal: AuthenticatedPrincipal, processId: string): Promise<ProcessDto> {
    const tree = await this.findTree(processId)
    await this.dependencies.guard.requireView(principal.id, tree.projectId)
    return processDto(tree)
  }

  async updateProcess(principal: AuthenticatedPrincipal, processId: string, input: UpdateProcessRequest): Promise<ProcessDto> {
    const tree = await this.findTree(processId)
    await this.dependencies.guard.requireEdit(principal.id, tree.projectId)
    if (input.name !== undefined) await this.dependencies.repository.updateProcess(processId, input.name)
    return this.getProcess(principal, processId)
  }

  async deleteProcess(principal: AuthenticatedPrincipal, processId: string): Promise<void> {
    const tree = await this.findTree(processId)
    await this.dependencies.guard.requireEdit(principal.id, tree.projectId)
    await this.dependencies.repository.deleteProcess(processId)
    for (const scheme of tree.schemes) this.dependencies.deferDelete(scheme.objectKey)
  }

  // --------------------------------------------------------
  // Шаги
  // --------------------------------------------------------

  async createStep(principal: AuthenticatedPrincipal, processId: string, input: CreateProcessStepRequest): Promise<ProcessDto> {
    const tree = await this.findTree(processId)
    await this.dependencies.guard.requireEdit(principal.id, tree.projectId)
    await this.assertMapTarget(tree, input.side, input.mapToStepId ?? null, input.disappears)

    const nextOrder = nextSortOrder(tree.steps.filter((step) => step.side === input.side))
    await this.dependencies.repository.createStep(processId, {
      side: input.side,
      title: input.title,
      actorRole: input.actorRole,
      tools: input.tools,
      effect: input.effect ?? null,
      mapToStepId: input.disappears ? null : input.mapToStepId ?? null,
      disappears: input.disappears,
      sortOrder: input.sortOrder ?? nextOrder,
    })
    return this.getProcess(principal, processId)
  }

  async updateStep(principal: AuthenticatedPrincipal, stepId: string, input: UpdateProcessStepRequest): Promise<ProcessDto> {
    const step = await this.findStep(stepId)
    const tree = await this.findTree(step.processId)
    await this.dependencies.guard.requireEdit(principal.id, tree.projectId)

    const side = input.side ?? step.side
    const mapToStepId = input.mapToStepId === undefined ? step.mapToStepId : input.disappears ? null : input.mapToStepId ?? null
    const disappears = input.disappears === undefined ? step.disappears : input.disappears
    await this.assertMapTarget(tree, side, mapToStepId, disappears)
    if (mapToStepId === stepId) {
      throw new ProcessesFailure('invalid', 'A step cannot map to itself')
    }

    await this.dependencies.repository.updateStep(stepId, {
      ...(input.side !== undefined ? { side } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.actorRole !== undefined ? { actorRole: input.actorRole } : {}),
      ...(input.tools !== undefined ? { tools: input.tools } : {}),
      ...(input.effect !== undefined ? { effect: input.effect ?? null } : {}),
      mapToStepId,
      disappears,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    })
    return this.getProcess(principal, step.processId)
  }

  async deleteStep(principal: AuthenticatedPrincipal, stepId: string): Promise<void> {
    const step = await this.findStep(stepId)
    const process = await this.dependencies.repository.findProcessById(step.processId)
    if (!process) throw new ProcessesFailure('not_found', 'Process not found')
    await this.dependencies.guard.requireEdit(principal.id, process.projectId)
    await this.dependencies.repository.deleteStep(stepId)
  }

  /** Переупорядочивание: список id должен покрывать сторону процесса без пропусков и лишних. */
  async reorderSteps(principal: AuthenticatedPrincipal, processId: string, input: ReorderProcessStepsRequest): Promise<ProcessDto> {
    const tree = await this.findTree(processId)
    await this.dependencies.guard.requireEdit(principal.id, tree.projectId)

    const sideIds = tree.steps.filter((step) => step.side === input.side).map((step) => step.id)
    if (sideIds.length !== input.ids.length || new Set(input.ids).size !== input.ids.length) {
      throw new ProcessesFailure('invalid', 'Reorder list must cover every step of this side exactly once')
    }
    const known = new Set(sideIds)
    for (const id of input.ids) {
      if (!known.has(id)) throw new ProcessesFailure('invalid', 'Reorder list contains a step from another side or process')
    }

    await this.dependencies.repository.reorderSteps(processId, input.side, input.ids)
    return this.getProcess(principal, processId)
  }

  // --------------------------------------------------------
  // Схемы StormBPMN: тикет → PUT в хранилище → подтверждение
  // --------------------------------------------------------

  async createSchemeUploadRequest(
    principal: AuthenticatedPrincipal,
    processId: string,
    side: ProcessSide,
    input: CreateProcessSchemeUploadRequest,
  ): Promise<CreateProcessSchemeUploadResponse> {
    const process = await this.findProcess(processId)
    await this.dependencies.guard.requireEdit(principal.id, process.projectId)

    const objectKey = this.dependencies.createObjectKey(process.projectId, processId, side)
    const upload = await this.dependencies.storage.createUploadUrl({
      key: objectKey,
      contentType: input.contentType,
      byteSize: input.byteSize,
    })

    const token = this.dependencies.tokens.issue({
      processId,
      side,
      objectKey,
      contentType: input.contentType,
      byteSize: input.byteSize,
      expiresAt: Math.floor(new Date(upload.expiresAt).getTime() / 1000),
    })

    return {
      upload: {
        token,
        method: upload.method,
        url: upload.url,
        headers: upload.headers,
        contentLength: upload.contentLength,
        expiresAt: upload.expiresAt,
      },
    }
  }

  /** Проверка байтов и привязка схемы к стороне; замена удаляет прежний объект после ответа. */
  async confirmSchemeUpload(
    principal: AuthenticatedPrincipal,
    processId: string,
    side: ProcessSide,
    input: ConfirmProcessSchemeUploadRequest,
  ): Promise<ProcessDto> {
    const process = await this.findProcess(processId)
    await this.dependencies.guard.requireEdit(principal.id, process.projectId)

    const claims = this.dependencies.tokens.verify(processId, side, input.token, this.dependencies.clock.now())
    if (!claims) {
      throw new ProcessesFailure('expired', 'Upload ticket is invalid or has expired; start a new upload')
    }

    const stored = await this.dependencies.storage.headObject(claims.objectKey)
    if (!stored) {
      throw new ProcessesFailure('not_completed', 'Upload has not finished; send the file again')
    }
    if (stored.contentLength !== claims.byteSize) {
      this.dependencies.deferDelete(claims.objectKey)
      throw new ProcessesFailure('rejected', 'Uploaded file size does not match the request')
    }
    if (stored.contentType !== claims.contentType) {
      this.dependencies.deferDelete(claims.objectKey)
      throw new ProcessesFailure('rejected', 'Uploaded file type does not match the request')
    }

    const existing = await this.dependencies.repository.findScheme(processId, side)
    await this.dependencies.repository.upsertScheme(processId, side, {
      objectKey: claims.objectKey,
      fileName: input.fileName,
    })
    if (existing && existing.objectKey !== claims.objectKey) this.dependencies.deferDelete(existing.objectKey)

    return this.getProcess(principal, processId)
  }

  /** Подписанный URL скачивания схемы: приватный доступ для всех ролей проекта. */
  async createSchemeDownloadUrl(
    principal: AuthenticatedPrincipal,
    processId: string,
    side: ProcessSide,
  ): Promise<ProcessSchemeDownload> {
    const process = await this.findProcess(processId)
    await this.dependencies.guard.requireView(principal.id, process.projectId)
    const scheme = await this.dependencies.repository.findScheme(processId, side)
    if (!scheme) throw new ProcessesFailure('not_found', 'Process has no scheme for this side')
    const download = await this.dependencies.storage.createDownloadUrl({ key: scheme.objectKey })
    return { url: download.url, expiresAt: download.expiresAt }
  }

  async deleteScheme(principal: AuthenticatedPrincipal, processId: string, side: ProcessSide): Promise<ProcessDto> {
    const process = await this.findProcess(processId)
    await this.dependencies.guard.requireEdit(principal.id, process.projectId)
    const scheme = await this.dependencies.repository.findScheme(processId, side)
    if (scheme) {
      await this.dependencies.repository.deleteScheme(processId, side)
      this.dependencies.deferDelete(scheme.objectKey)
    }
    return this.getProcess(principal, processId)
  }

  /** mapToStepId: только шаг tobe того же процесса; disappears — самодостаточен. */
  private async assertMapTarget(tree: ProcessTreeRow, side: ProcessSide, mapToStepId: string | null, disappears: boolean) {
    if (disappears && mapToStepId != null) {
      throw new ProcessesFailure('invalid', 'A step either maps to a TO-BE step or disappears, not both')
    }
    if (side !== 'asis' && mapToStepId != null) {
      throw new ProcessesFailure('invalid', 'Only AS-IS steps map to TO-BE steps')
    }
    if (mapToStepId != null) {
      const target = tree.steps.find((step) => step.id === mapToStepId)
      if (!target || target.processId !== tree.id) {
        throw new ProcessesFailure('invalid', 'mapToStepId must reference a step of the same process')
      }
      if (target.side !== 'tobe') {
        throw new ProcessesFailure('invalid', 'mapToStepId must reference a TO-BE step')
      }
    }
  }

  private async findTree(processId: string): Promise<ProcessTreeRow> {
    const tree = await this.dependencies.repository.findProcessTreeById(processId)
    if (!tree) throw new ProcessesFailure('not_found', 'Process not found')
    return tree
  }

  private async findProcess(processId: string) {
    const process = await this.dependencies.repository.findProcessById(processId)
    if (!process) throw new ProcessesFailure('not_found', 'Process not found')
    return process
  }

  private async findStep(stepId: string): Promise<ProcessStepRow> {
    const step = await this.dependencies.repository.findStepById(stepId)
    if (!step) throw new ProcessesFailure('not_found', 'Process step not found')
    return step
  }
}

function nextSortOrder(steps: Array<{ sortOrder: number }>): number {
  return steps.reduce((max, step) => Math.max(max, step.sortOrder + 1), 0)
}

export function processDto(row: ProcessTreeRow): ProcessDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    steps: row.steps.map((step) => ({
      id: step.id,
      processId: step.processId,
      side: step.side,
      title: step.title,
      actorRole: step.actorRole,
      tools: step.tools,
      effect: step.effect,
      mapToStepId: step.mapToStepId,
      disappears: step.disappears,
      sortOrder: step.sortOrder,
    })),
    schemes: row.schemes.map((scheme) => ({
      side: scheme.side,
      fileName: scheme.fileName,
      createdAt: scheme.createdAt.toISOString(),
      updatedAt: scheme.updatedAt.toISOString(),
    })),
  }
}
