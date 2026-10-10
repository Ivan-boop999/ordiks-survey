import type {
  CreateProjectFromTemplateRequest,
  CreateProjectTemplateRequest,
  ProjectDetail,
  ProjectTemplatePayload,
  ProjectTemplateRecordDto,
  ProjectToTemplateRequest,
  UpdateProjectTemplateRequest,
} from '@ordiks-survey/contracts'
import { projectTemplatePayloadSchema } from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import { canManageMembers } from '../domain/access'
import { ProjectsFailure } from '../domain/errors'
import type { ProjectAccessGuard } from './access-guard'
import type { TemplateRow, TemplatesRepository } from './ports'

type TemplatesServiceDependencies = {
  guard: ProjectAccessGuard
  repository: TemplatesRepository
  /// Деталь созданного из шаблона проекта отдаёт ProjectsService (одна точка сборки DTO).
  projectsService: { getProject(principal: AuthenticatedPrincipal, projectId: string): Promise<ProjectDetail> }
}

/**
 * Библиотека методик: CRUD шаблонов (читает команда ОРДИКС, пишет owner/manager),
 * разворачивание шаблона в новый проект (все id новыми, showIf перевязаны, записи и
 * прогресс не копируются) и снимок текущего проекта в шаблон (templateFromProject
 * прототипа: этапы/домены/гайды/разделы/справочники/реестры без данных).
 */
export class TemplatesService {
  constructor(private readonly dependencies: TemplatesServiceDependencies) {}

  async listTemplates(principal: AuthenticatedPrincipal): Promise<ProjectTemplateRecordDto[]> {
    this.requireTeam(principal, 'Only the Ordiks team can browse the template library')
    return (await this.dependencies.repository.listTemplates()).map(templateDto)
  }

  async createTemplate(principal: AuthenticatedPrincipal, input: CreateProjectTemplateRequest): Promise<ProjectTemplateRecordDto> {
    this.requireManager(principal)
    return templateDto(await this.dependencies.repository.createTemplate(input))
  }

  async updateTemplate(principal: AuthenticatedPrincipal, templateId: string, input: UpdateProjectTemplateRequest): Promise<ProjectTemplateRecordDto> {
    this.requireManager(principal)
    const updated = await this.dependencies.repository.updateTemplate(templateId, input)
    if (!updated) throw new ProjectsFailure('not_found', 'Template not found')
    return templateDto(updated)
  }

  async deleteTemplate(principal: AuthenticatedPrincipal, templateId: string): Promise<void> {
    this.requireManager(principal)
    const deleted = await this.dependencies.repository.deleteTemplate(templateId)
    if (!deleted) throw new ProjectsFailure('not_found', 'Template not found')
  }

  /** Разворачивает payload шаблона в новый проект; creator становится участником-менеджером. */
  async createProjectFromTemplate(
    principal: AuthenticatedPrincipal,
    input: CreateProjectFromTemplateRequest,
  ): Promise<ProjectDetail> {
    this.requireTeam(principal, 'Only the Ordiks team can create projects')
    const created = await this.dependencies.repository.createProjectFromTemplate(principal, input)
    return this.dependencies.projectsService.getProject(principal, created.id)
  }

  /** Снимок структуры проекта (без записей и прогресса) как новый шаблон. */
  async projectToTemplate(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: ProjectToTemplateRequest,
  ): Promise<ProjectTemplateRecordDto> {
    const access = await this.dependencies.guard.context(principal.id, projectId)
    if (!access.edit) {
      throw new ProjectsFailure(
        access.view ? 'forbidden' : 'not_found',
        access.view ? 'Only the Ordiks team can template a project' : 'Project not found',
      )
    }
    if (!canManageMembers(principal.orgRole)) {
      throw new ProjectsFailure('forbidden', 'Only owners and managers can manage templates')
    }
    const payload = await this.dependencies.repository.buildPayloadFromProject(projectId)
    return this.createTemplate(principal, { name: input.name, description: input.description, payload: payload as never })
  }

  /// Библиотека — внутренняя страница команды; посторонний клиент получает 403.
  private requireTeam(principal: AuthenticatedPrincipal, message: string) {
    if (principal.orgRole === 'client') throw new ProjectsFailure('forbidden', message)
  }

  private requireManager(principal: AuthenticatedPrincipal) {
    if (!canManageMembers(principal.orgRole)) {
      throw new ProjectsFailure('forbidden', 'Only owners and managers can manage templates')
    }
  }
}

/// payload в DTO перепроверяется схемой: мусор в JSON не должен ронять библиотеку.
export function templateDto(row: TemplateRow): ProjectTemplateRecordDto {
  const parsed = projectTemplatePayloadSchema.safeParse(row.payload)
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    payload: parsed.success ? parsed.data : projectTemplatePayloadSchema.parse({}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
