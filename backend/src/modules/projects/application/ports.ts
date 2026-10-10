import type {
  DomainStatus,
  MemberRole,
  OrgRole,
  ProjectSettings,
  ProjectStatus,
  StageStatus,
  TaskStatus,
  TasksQuery,
} from '@ordiks-survey/contracts'

import type { ProjectAccessContext } from '../domain/access'

export type Clock = {
  now(): Date
}

export type ProjectRow = {
  id: string
  name: string
  client: string
  city: string
  status: ProjectStatus
  boundaries: string
  goals: string
  shops: string[]
  settings: unknown
  createdAt: Date
  updatedAt: Date
}

export type ProjectMemberRow = {
  id: string
  userId: string
  role: MemberRole
  email: string
  displayName: string | null
  createdAt: Date
}

export type ProjectDetailRow = ProjectRow & {
  members: ProjectMemberRow[]
}

export type StageRow = {
  id: string
  projectId: string
  name: string
  sortOrder: number
  startAt: Date | null
  endAt: Date | null
  milestone: boolean
  status: StageStatus
}

export type TaskRow = {
  id: string
  projectId: string
  stageId: string | null
  domainId: string | null
  assigneeId: string | null
  title: string
  description: string
  deadline: Date | null
  status: TaskStatus
  sortOrder: number
  doneAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ChecklistItemRow = {
  id: string
  domainId: string
  text: string
  done: boolean
  sortOrder: number
}

export type DomainRow = {
  id: string
  projectId: string
  groupId: string
  ownerId: string | null
  name: string
  status: DomainStatus
  sortOrder: number
}

export type DomainGroupRow = {
  id: string
  projectId: string
  name: string
  sortOrder: number
}

export type DomainGroupTreeRow = DomainGroupRow & {
  domains: Array<DomainRow & { checklist: ChecklistItemRow[] }>
}

export type CreateProjectWrite = {
  project: {
    name: string
    client: string
    city: string
    boundaries: string
    goals: string
    shops: string[]
    settings: ProjectSettings
  }
  creatorMember: {
    userId: string
    role: MemberRole
  }
  stages: Array<{
    name: string
    sortOrder: number
    startAt: Date | null
    endAt: Date | null
    milestone: boolean
    status: StageStatus
  }>
  groups: Array<{ name: string; sortOrder: number }>
  domains: Array<{
    groupIndex: number
    name: string
    sortOrder: number
    checklist: string[]
  }>
}

/**
 * Доступ и данные проектов. `findAccessContext` — единственная точка правды о том, кто кого
 * видит: orgRole из users + членство в project_members.
 */
export type ProjectsRepository = {
  findAccessContext(userId: string, projectId: string): Promise<ProjectAccessContext | null>

  listProjects(userId: string, orgRole: OrgRole): Promise<Array<ProjectRow & { memberRole: MemberRole | null }>>

  /** Непрочитанные комментарии по проектам: новее ThreadRead пользователя и не от него. */
  countUnreadComments(userId: string, projectIds: string[]): Promise<Map<string, number>>

  createProject(input: CreateProjectWrite): Promise<ProjectRow>

  findProjectById(projectId: string): Promise<ProjectDetailRow | null>

  updateProject(
    projectId: string,
    data: Partial<Pick<ProjectRow, 'name' | 'client' | 'city' | 'status' | 'boundaries' | 'goals' | 'shops' | 'settings'>>,
  ): Promise<ProjectRow | null>

  listMembers(projectId: string): Promise<ProjectMemberRow[]>

  addMember(input: { projectId: string; userId: string; role: MemberRole }): Promise<ProjectMemberRow>

  findMemberById(memberId: string): Promise<(ProjectMemberRow & { projectId: string }) | null>

  updateMemberRole(memberId: string, role: MemberRole): Promise<ProjectMemberRow | null>

  deleteMember(memberId: string): Promise<boolean>

  findUserById(userId: string): Promise<{ id: string; orgRole: OrgRole } | null>

  listStages(projectId: string): Promise<StageRow[]>

  createStage(
    input: Omit<StageRow, 'id'> & { status: StageStatus },
  ): Promise<StageRow>

  findStageById(stageId: string): Promise<StageRow | null>

  updateStage(
    stageId: string,
    data: Partial<Pick<StageRow, 'name' | 'sortOrder' | 'startAt' | 'endAt' | 'milestone' | 'status'>>,
  ): Promise<StageRow | null>

  deleteStage(stageId: string): Promise<boolean>

  listTasks(projectId: string, query: TasksQuery): Promise<TaskRow[]>

  createTask(input: Omit<TaskRow, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskRow>

  findTaskById(taskId: string): Promise<TaskRow | null>

  updateTask(
    taskId: string,
    data: Partial<Pick<TaskRow, 'stageId' | 'domainId' | 'assigneeId' | 'title' | 'description' | 'deadline' | 'status' | 'sortOrder' | 'doneAt'>>,
  ): Promise<TaskRow | null>

  deleteTask(taskId: string): Promise<boolean>

  listDomainTree(projectId: string): Promise<DomainGroupTreeRow[]>

  createDomainGroup(input: { projectId: string; name: string; sortOrder: number }): Promise<DomainGroupRow>

  findDomainGroupById(groupId: string): Promise<DomainGroupRow | null>

  updateDomainGroup(
    groupId: string,
    data: Partial<Pick<DomainGroupRow, 'name' | 'sortOrder'>>,
  ): Promise<DomainGroupRow | null>

  deleteDomainGroup(groupId: string): Promise<boolean>

  createDomain(
    input: { projectId: string; groupId: string; ownerId: string | null; name: string; sortOrder: number; status: DomainStatus; checklist: string[] },
  ): Promise<DomainRow & { checklist: ChecklistItemRow[] }>

  findDomainById(domainId: string): Promise<DomainRow | null>

  updateDomain(
    domainId: string,
    data: Partial<Pick<DomainRow, 'groupId' | 'ownerId' | 'name' | 'status' | 'sortOrder'>>,
  ): Promise<(DomainRow & { checklist: ChecklistItemRow[] }) | null>

  deleteDomain(domainId: string): Promise<boolean>

  createChecklistItem(input: { domainId: string; text: string; done: boolean; sortOrder: number }): Promise<ChecklistItemRow>

  findChecklistItemById(itemId: string): Promise<(ChecklistItemRow & { domain: DomainRow }) | null>

  /** Меняет пункт и в той же транзакции пересчитывает статус домена по чек-листу. */
  updateChecklistItem(
    itemId: string,
    data: Partial<Pick<ChecklistItemRow, 'text' | 'done' | 'sortOrder'>>,
  ): Promise<ChecklistItemRow | null>

  deleteChecklistItem(itemId: string): Promise<boolean>
}

// ============================================================
// Шаблоны проектов (библиотека методик)
// ============================================================

export type TemplateRow = {
  id: string
  name: string
  description: string
  payload: unknown
  createdAt: Date
  updatedAt: Date
}

/** Библиотека методик: CRUD шаблонов + разворачивание в проект + снимок проекта. */
export type TemplatesRepository = {
  listTemplates(): Promise<TemplateRow[]>

  createTemplate(input: { name: string; description: string; payload: unknown }): Promise<TemplateRow>

  findTemplateById(templateId: string): Promise<TemplateRow | null>

  updateTemplate(
    templateId: string,
    data: Partial<Pick<TemplateRow, 'name' | 'description' | 'payload'>>,
  ): Promise<TemplateRow | null>

  deleteTemplate(templateId: string): Promise<boolean>

  /** Разворачивает payload в новый проект (одна транзакция); creator — участник-менеджер. */
  createProjectFromTemplate(
    principal: { id: string; orgRole: string },
    input: { templateId: string; name: string; client: string; city: string; shops: string[] },
  ): Promise<{ id: string }>

  /** Снимок структуры проекта как payload шаблона (без записей и прогресса). */
  buildPayloadFromProject(projectId: string): Promise<unknown>
}
