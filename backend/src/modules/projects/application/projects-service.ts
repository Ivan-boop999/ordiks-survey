import {
  memberRoleForOrgRole,
  projectSettingsSchema,
  type CreateProjectMemberRequest,
  type CreateProjectRequest,
  type MemberRole,
  type OrgRole,
  type ProjectAccess,
  type ProjectDetail,
  type ProjectSettings,
  type ProjectStatus,
  type ProjectSummary,
  type UpdateProjectRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import { accessFor, canManageMembers, isTeamOrgRole } from '../domain/access'
import { ProjectsFailure } from '../domain/errors'
import type { ProjectAccessGuard } from './access-guard'
import type {
  Clock,
  CreateProjectWrite,
  ProjectDetailRow,
  ProjectMemberRow,
  ProjectRow,
  ProjectsRepository,
} from './ports'

type ProjectsServiceDependencies = {
  clock: Clock
  guard: ProjectAccessGuard
  repository: ProjectsRepository
}

/** Проекты и состав: список, паспорт, справочники, архивация, члены. Доступ — через guard. */
export class ProjectsService {
  private readonly dependencies: ProjectsServiceDependencies

  constructor(dependencies: ProjectsServiceDependencies) {
    this.dependencies = dependencies
  }

  async listProjects(principal: AuthenticatedPrincipal): Promise<ProjectSummary[]> {
    const rows = await this.dependencies.repository.listProjects(principal.id, principal.orgRole)
    // Непрочитанные комментарии — один GROUP BY на весь список, не по запросу на проект.
    const unread = await this.dependencies.repository.countUnreadComments(
      principal.id,
      rows.map((row) => row.id),
    )
    return rows.map((row) => this.summaryDto(row, principal.orgRole, unread.get(row.id) ?? 0))
  }

  async createProject(principal: AuthenticatedPrincipal, input: CreateProjectRequest): Promise<ProjectDetail> {
    if (!isTeamOrgRole(principal.orgRole)) {
      throw new ProjectsFailure('forbidden', 'Only the Ordiks team can create projects')
    }

    const row = await this.dependencies.repository.createProject(
      this.templateWrite(principal, input),
    )
    return this.detailDto(
      (await this.dependencies.repository.findProjectById(row.id)) ?? { ...row, members: [] },
      { view: true, comment: true, edit: true },
      // Свежий проект: комментариев быть не может.
      0,
    )
  }

  async getProject(principal: AuthenticatedPrincipal, projectId: string): Promise<ProjectDetail> {
    const access = await this.dependencies.guard.requireView(principal.id, projectId)
    const row = await this.dependencies.repository.findProjectById(projectId)
    if (!row) throw new ProjectsFailure('not_found', 'Project not found')
    const unread = await this.dependencies.repository.countUnreadComments(principal.id, [projectId])
    return this.detailDto(row, access, unread.get(projectId) ?? 0)
  }

  async updateProject(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: UpdateProjectRequest,
  ): Promise<ProjectDetail> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const row = await this.dependencies.repository.updateProject(projectId, {
      ...input,
    })
    if (!row) throw new ProjectsFailure('not_found', 'Project not found')
    return this.getProject(principal, projectId)
  }

  async updateProjectStatus(
    principal: AuthenticatedPrincipal,
    projectId: string,
    status: ProjectStatus,
  ): Promise<ProjectDetail> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const row = await this.dependencies.repository.updateProject(projectId, { status })
    if (!row) throw new ProjectsFailure('not_found', 'Project not found')
    return this.getProject(principal, projectId)
  }

  async listMembers(principal: AuthenticatedPrincipal, projectId: string) {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listMembers(projectId)).map(memberDto)
  }

  async addMember(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: CreateProjectMemberRequest,
  ) {
    await this.requireMemberManager(principal, projectId)
    const user = await this.dependencies.repository.findUserById(input.userId)
    if (!user) throw new ProjectsFailure('not_found', 'User not found')
    return memberDto(await this.dependencies.repository.addMember({ projectId, ...input }))
  }

  async updateMemberRole(
    principal: AuthenticatedPrincipal,
    projectId: string,
    memberId: string,
    role: MemberRole,
  ) {
    await this.requireMemberManager(principal, projectId)
    const member = await this.memberOfProject(memberId, projectId)
    return memberDto((await this.dependencies.repository.updateMemberRole(member.id, role)) ?? member)
  }

  async removeMember(principal: AuthenticatedPrincipal, projectId: string, memberId: string) {
    await this.requireMemberManager(principal, projectId)
    const member = await this.memberOfProject(memberId, projectId)
    await this.dependencies.repository.deleteMember(member.id)
  }

  private async requireMemberManager(principal: AuthenticatedPrincipal, projectId: string) {
    await this.dependencies.guard.requireView(principal.id, projectId)
    if (!canManageMembers(principal.orgRole)) {
      throw new ProjectsFailure('forbidden', 'Only owners and managers can manage project members')
    }
  }

  private async memberOfProject(memberId: string, projectId: string) {
    const member = await this.dependencies.repository.findMemberById(memberId)
    if (!member || member.projectId !== projectId) {
      throw new ProjectsFailure('not_found', 'Project member not found')
    }
    return member
  }

  /** Раскладывает шаблон-объект в строки: этапы по датам от сегодня, домены в группы по индексу. */
  private templateWrite(
    principal: AuthenticatedPrincipal,
    input: CreateProjectRequest,
  ): CreateProjectWrite {
    if (!isTeamOrgRole(principal.orgRole)) {
      throw new ProjectsFailure('forbidden', 'Only the Ordiks team can create projects')
    }
    const template = input.template
    const stageNames = template?.stageNames ?? []
    if (template) {
      for (const domain of template.domains) {
        if (domain.groupIndex >= template.groups.length) {
          throw new ProjectsFailure(
            'invalid',
            `Domain "${domain.name}" references group ${domain.groupIndex}, but the template has ${template.groups.length}`,
          )
        }
      }
    }

    const today = startOfDay(this.dependencies.clock.now())
    const stageCount = stageNames.length
    const stageSpanDays = Math.max(
      7,
      Math.round(((template?.weeks ?? 4) * 7) / Math.max(1, stageCount)),
    )

    return {
      project: {
        name: input.name,
        client: input.client,
        city: input.city,
        boundaries: input.boundaries,
        goals: input.goals,
        shops: input.shops,
        // Нормализуем один раз: дефолты справочников остаются в БД, а не в каждом чтении.
        settings: projectSettingsSchema.parse(input.settings ?? {}),
      },
      creatorMember: {
        userId: principal.id,
        role: memberRoleForOrgRole(principal.orgRole),
      },
      stages: stageNames.map((name, index) => ({
        name,
        sortOrder: index,
        startAt: addDays(today, index * stageSpanDays),
        endAt: addDays(today, (index + 1) * stageSpanDays - 1),
        milestone: index === stageCount - 1,
        status: index === 0 ? ('active' as const) : ('planned' as const),
      })),
      groups: (template?.groups ?? []).map((name, sortOrder) => ({ name, sortOrder })),
      domains: (template?.domains ?? []).map((domain, sortOrder) => ({
        groupIndex: domain.groupIndex,
        name: domain.name,
        sortOrder,
        checklist: domain.checklist,
      })),
    }
  }

  private summaryDto(
    row: ProjectRow & { memberRole: MemberRole | null },
    orgRole: OrgRole,
    unreadComments: number,
  ): ProjectSummary {
    return {
      id: row.id,
      name: row.name,
      client: row.client,
      city: row.city,
      status: row.status,
      access: accessFor({ orgRole, memberRole: row.memberRole }),
      unreadComments,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private detailDto(row: ProjectDetailRow, access: ProjectAccess, unreadComments: number): ProjectDetail {
    return {
      id: row.id,
      name: row.name,
      client: row.client,
      city: row.city,
      status: row.status,
      access,
      unreadComments,
      boundaries: row.boundaries,
      goals: row.goals,
      shops: row.shops,
      settings: settingsDto(row.settings),
      members: row.members.map(memberDto),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}

function memberDto(row: ProjectMemberRow) {
  return {
    id: row.id,
    userId: row.userId,
    role: row.role,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Записывается только через `projectSettingsSchema`, поэтому чтение — разбор той же схемой. */
function settingsDto(settings: unknown): ProjectSettings {
  return projectSettingsSchema.parse(settings)
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
