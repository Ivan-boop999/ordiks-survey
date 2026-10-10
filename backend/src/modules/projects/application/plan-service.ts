import type {
  CreateStageRequest,
  CreateTaskRequest,
  StageDto,
  StageStatus,
  TaskDto,
  TasksQuery,
  UpdateStageRequest,
  UpdateTaskRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import { ProjectsFailure } from '../domain/errors'
import type { ProjectAccessGuard } from './access-guard'
import type {
  Clock,
  ProjectsRepository,
  StageRow,
  TaskRow,
} from './ports'

type PlanServiceDependencies = {
  clock: Clock
  guard: ProjectAccessGuard
  repository: ProjectsRepository
}

/** Этапы и задачи проекта; правка — только команда (edit). */
export class PlanService {
  constructor(private readonly dependencies: PlanServiceDependencies) {}

  async listStages(principal: AuthenticatedPrincipal, projectId: string): Promise<StageDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listStages(projectId)).map(stageDto)
  }

  async createStage(principal: AuthenticatedPrincipal, projectId: string, input: CreateStageRequest) {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const row = await this.dependencies.repository.createStage({
      projectId,
      name: input.name,
      sortOrder: input.sortOrder ?? (await this.nextStageOrder(projectId)),
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
      milestone: input.milestone ?? false,
      status: input.status ?? 'planned',
    })
    return stageDto(row)
  }

  async updateStage(principal: AuthenticatedPrincipal, stageId: string, input: UpdateStageRequest) {
    const stage = await this.findStage(stageId)
    await this.dependencies.guard.requireEdit(principal.id, stage.projectId)
    // nullish-поля проходят как есть: undefined — «не менять», null — «очистить»; Prisma
    // игнорирует undefined-ключи, поэтому явные null очищают даты.
    const row = await this.dependencies.repository.updateStage(stageId, { ...input })
    return stageDto(row ?? stage)
  }

  async deleteStage(principal: AuthenticatedPrincipal, stageId: string) {
    const stage = await this.findStage(stageId)
    await this.dependencies.guard.requireEdit(principal.id, stage.projectId)
    await this.dependencies.repository.deleteStage(stageId)
  }

  async listTasks(principal: AuthenticatedPrincipal, projectId: string, query: TasksQuery) {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listTasks(projectId, query)).map(taskDto)
  }

  async createTask(principal: AuthenticatedPrincipal, projectId: string, input: CreateTaskRequest) {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    await this.assertTaskLinks(projectId, input)

    const now = this.dependencies.clock.now()
    const row = await this.dependencies.repository.createTask({
      projectId,
      stageId: input.stageId ?? null,
      domainId: input.domainId ?? null,
      assigneeId: input.assigneeId ?? null,
      title: input.title,
      description: input.description,
      deadline: input.deadline ?? null,
      status: input.status ?? 'todo',
      sortOrder: input.sortOrder ?? 0,
      doneAt: input.status === 'done' ? now : null,
    })
    return taskDto(row)
  }

  async updateTask(principal: AuthenticatedPrincipal, taskId: string, input: UpdateTaskRequest) {
    const task = await this.findTask(taskId)
    await this.dependencies.guard.requireEdit(principal.id, task.projectId)
    await this.assertTaskLinks(task.projectId, input)

    // nullish-поля проходят как есть: undefined — «не менять», null — «отвязать».
    const row = await this.dependencies.repository.updateTask(taskId, {
      ...input,
      doneAt: this.doneAtFor(task, input),
    })
    return taskDto(row ?? task)
  }

  async deleteTask(principal: AuthenticatedPrincipal, taskId: string) {
    const task = await this.findTask(taskId)
    await this.dependencies.guard.requireEdit(principal.id, task.projectId)
    await this.dependencies.repository.deleteTask(taskId)
  }

  private doneAtFor(task: TaskRow, input: UpdateTaskRequest): Date | null | undefined {
    if (input.status === undefined) return undefined
    if (input.status === 'done') return task.doneAt ?? this.dependencies.clock.now()
    return null
  }

  private async nextStageOrder(projectId: string): Promise<number> {
    const stages = await this.dependencies.repository.listStages(projectId)
    return stages.reduce((maximum, stage) => Math.max(maximum, stage.sortOrder + 1), 0)
  }

  private async findStage(stageId: string): Promise<StageRow> {
    const stage = await this.dependencies.repository.findStageById(stageId)
    if (!stage) throw new ProjectsFailure('not_found', 'Stage not found')
    return stage
  }

  private async findTask(taskId: string): Promise<TaskRow> {
    const task = await this.dependencies.repository.findTaskById(taskId)
    if (!task) throw new ProjectsFailure('not_found', 'Task not found')
    return task
  }

  /** Связи задачи (этап/домен/исполнитель) должны принадлежать тому же проекту (или быть пустыми). */
  private async assertTaskLinks(projectId: string, input: { stageId?: string | null; domainId?: string | null; assigneeId?: string | null }) {
    if (input.stageId != null) {
      const stage = await this.dependencies.repository.findStageById(input.stageId)
      if (!stage || stage.projectId !== projectId) {
        throw new ProjectsFailure('invalid', 'Stage does not belong to this project')
      }
    }
    if (input.domainId != null) {
      const domain = await this.dependencies.repository.findDomainById(input.domainId)
      if (!domain || domain.projectId !== projectId) {
        throw new ProjectsFailure('invalid', 'Domain does not belong to this project')
      }
    }
    if (input.assigneeId != null) {
      const assignee = await this.dependencies.repository.findUserById(input.assigneeId)
      if (!assignee) throw new ProjectsFailure('invalid', 'Assignee user not found')
    }
  }
}

function stageDto(row: StageRow): StageDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    sortOrder: row.sortOrder,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    milestone: row.milestone,
    status: row.status,
  }
}

function taskDto(row: TaskRow): TaskDto {
  return {
    id: row.id,
    projectId: row.projectId,
    stageId: row.stageId,
    domainId: row.domainId,
    assigneeId: row.assigneeId,
    title: row.title,
    description: row.description,
    deadline: row.deadline?.toISOString() ?? null,
    status: row.status,
    sortOrder: row.sortOrder,
    doneAt: row.doneAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
