import {
  acceptInviteRequestSchema,
  acceptInviteResponseSchema,
  checklistItemSchema,
  createChecklistItemRequestSchema,
  createDomainGroupRequestSchema,
  createDomainRequestSchema,
  createProjectRequestSchema,
  createStageRequestSchema,
  createTaskRequestSchema,
  dataRequestSchema,
  dataRequestsQuerySchema,
  dataRequestsResponseSchema,
  domainGroupSchema,
  domainGroupsResponseSchema,
  domainSchema,
  findingsQuerySchema,
  findingsResponseSchema,
  guidesResponseSchema,
  interviewsQuerySchema,
  interviewsResponseSchema,
  projectDetailSchema,
  projectMembersResponseSchema,
  projectsResponseSchema,
  stageSchema,
  stagesResponseSchema,
  taskSchema,
  tasksQuerySchema,
  tasksResponseSchema,
  updateChecklistItemRequestSchema,
  updateDataRequestStatusRequestSchema,
  updateDomainGroupRequestSchema,
  updateDomainRequestSchema,
  updateProjectRequestSchema,
  updateStageRequestSchema,
  updateTaskRequestSchema,
  type AcceptInviteRequest,
  type CreateChecklistItemRequest,
  type CreateDomainGroupRequest,
  type CreateDomainRequest,
  type CreateProjectRequest,
  type CreateStageRequest,
  type CreateTaskRequest,
  type DataRequestsQuery,
  type FindingsQuery,
  type InterviewsQuery,
  type TasksQuery,
  type UpdateChecklistItemRequest,
  type UpdateDataRequestStatusRequest,
  type UpdateDomainGroupRequest,
  type UpdateDomainRequest,
  type UpdateProjectRequest,
  type UpdateStageRequest,
  type UpdateTaskRequest,
} from '@ordiks-survey/contracts'
import { z } from 'zod'

import { HttpClient, type AuthenticatedTransport } from '@/platform/api'

const id = (value: string) => encodeURIComponent(value)

/** DELETE-эндпоинты отвечают 204 без тела; HttpClient разбирает пустой ответ как undefined. */
const noContent = z.void()

// ============================================================
// Проекты и участники
// ============================================================

export function listProjects(
  transport: AuthenticatedTransport,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request('/api/projects', projectsResponseSchema, options)
}

export function getProject(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/projects/${id(projectId)}`, projectDetailSchema, options)
}

export function createProject(transport: AuthenticatedTransport, input: CreateProjectRequest) {
  return transport.request('/api/projects', projectDetailSchema, {
    method: 'POST',
    body: createProjectRequestSchema.parse(input),
  })
}

export function updateProject(
  transport: AuthenticatedTransport,
  projectId: string,
  input: UpdateProjectRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}`, projectDetailSchema, {
    method: 'PATCH',
    body: updateProjectRequestSchema.parse(input),
  })
}

export function archiveProject(
  transport: AuthenticatedTransport,
  projectId: string,
  status: 'active' | 'archived',
) {
  return transport.request(`/api/projects/${id(projectId)}/status`, projectDetailSchema, {
    method: 'PATCH',
    body: { status },
  })
}

export function listProjectMembers(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(
    `/api/projects/${id(projectId)}/members`,
    projectMembersResponseSchema,
    options,
  )
}

// ============================================================
// Этапы
// ============================================================

export function listStages(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/projects/${id(projectId)}/stages`, stagesResponseSchema, options)
}

export function createStage(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateStageRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/stages`, stageSchema, {
    method: 'POST',
    body: createStageRequestSchema.parse(input),
  })
}

export function updateStage(
  transport: AuthenticatedTransport,
  stageId: string,
  input: UpdateStageRequest,
) {
  return transport.request(`/api/stages/${id(stageId)}`, stageSchema, {
    method: 'PATCH',
    body: updateStageRequestSchema.parse(input),
  })
}

export function deleteStage(transport: AuthenticatedTransport, stageId: string) {
  return transport.request(`/api/stages/${id(stageId)}`, noContent, { method: 'DELETE' })
}

// ============================================================
// Задачи
// ============================================================

export function listTasks(
  transport: AuthenticatedTransport,
  projectId: string,
  query: TasksQuery = {},
  options: { signal?: AbortSignal } = {},
) {
  const search = new URLSearchParams()
  const normalized = tasksQuerySchema.parse(query)
  if (normalized.stageId) search.set('stageId', normalized.stageId)
  if (normalized.domainId) search.set('domainId', normalized.domainId)
  if (normalized.assigneeId) search.set('assigneeId', normalized.assigneeId)
  if (normalized.status) search.set('status', normalized.status)
  const qs = search.toString()
  return transport.request(
    `/api/projects/${id(projectId)}/tasks${qs ? `?${qs}` : ''}`,
    tasksResponseSchema,
    options,
  )
}

export function createTask(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateTaskRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/tasks`, taskSchema, {
    method: 'POST',
    body: createTaskRequestSchema.parse(input),
  })
}

export function updateTask(
  transport: AuthenticatedTransport,
  taskId: string,
  input: UpdateTaskRequest,
) {
  return transport.request(`/api/tasks/${id(taskId)}`, taskSchema, {
    method: 'PATCH',
    body: updateTaskRequestSchema.parse(input),
  })
}

export function deleteTask(transport: AuthenticatedTransport, taskId: string) {
  return transport.request(`/api/tasks/${id(taskId)}`, noContent, { method: 'DELETE' })
}

// ============================================================
// Домены и чек-листы
// ============================================================

export function listDomainGroups(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(
    `/api/projects/${id(projectId)}/domain-groups`,
    domainGroupsResponseSchema,
    options,
  )
}

export function createDomainGroup(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateDomainGroupRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/domain-groups`, domainGroupSchema, {
    method: 'POST',
    body: createDomainGroupRequestSchema.parse(input),
  })
}

export function updateDomainGroup(
  transport: AuthenticatedTransport,
  groupId: string,
  input: UpdateDomainGroupRequest,
) {
  return transport.request(`/api/domain-groups/${id(groupId)}`, domainGroupSchema, {
    method: 'PATCH',
    body: updateDomainGroupRequestSchema.parse(input),
  })
}

export function deleteDomainGroup(transport: AuthenticatedTransport, groupId: string) {
  return transport.request(`/api/domain-groups/${id(groupId)}`, noContent, { method: 'DELETE' })
}

export function createDomain(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateDomainRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/domains`, domainSchema, {
    method: 'POST',
    body: createDomainRequestSchema.parse(input),
  })
}

export function updateDomain(
  transport: AuthenticatedTransport,
  domainId: string,
  input: UpdateDomainRequest,
) {
  return transport.request(`/api/domains/${id(domainId)}`, domainSchema, {
    method: 'PATCH',
    body: updateDomainRequestSchema.parse(input),
  })
}

export function deleteDomain(transport: AuthenticatedTransport, domainId: string) {
  return transport.request(`/api/domains/${id(domainId)}`, noContent, { method: 'DELETE' })
}

export function createChecklistItem(
  transport: AuthenticatedTransport,
  domainId: string,
  input: CreateChecklistItemRequest,
) {
  return transport.request(`/api/domains/${id(domainId)}/checklist`, checklistItemSchema, {
    method: 'POST',
    body: createChecklistItemRequestSchema.parse(input),
  })
}

export function updateChecklistItem(
  transport: AuthenticatedTransport,
  itemId: string,
  input: UpdateChecklistItemRequest,
) {
  return transport.request(`/api/checklist-items/${id(itemId)}`, checklistItemSchema, {
    method: 'PATCH',
    body: updateChecklistItemRequestSchema.parse(input),
  })
}

export function deleteChecklistItem(transport: AuthenticatedTransport, itemId: string) {
  return transport.request(`/api/checklist-items/${id(itemId)}`, noContent, { method: 'DELETE' })
}

// ============================================================
// Запросы данных, находки, интервью, гайды (чтение для F1)
// ============================================================

export function listDataRequests(
  transport: AuthenticatedTransport,
  projectId: string,
  query: DataRequestsQuery = {},
  options: { signal?: AbortSignal } = {},
) {
  const search = new URLSearchParams()
  const normalized = dataRequestsQuerySchema.parse(query)
  if (normalized.status) search.set('status', normalized.status)
  if (normalized.domainId) search.set('domainId', normalized.domainId)
  if (normalized.overdue !== undefined) search.set('overdue', normalized.overdue ? 'true' : 'false')
  const qs = search.toString()
  return transport.request(
    `/api/projects/${id(projectId)}/requests${qs ? `?${qs}` : ''}`,
    dataRequestsResponseSchema,
    options,
  )
}

export function updateDataRequestStatus(
  transport: AuthenticatedTransport,
  requestId: string,
  input: UpdateDataRequestStatusRequest,
) {
  return transport.request(`/api/requests/${id(requestId)}/status`, dataRequestSchema, {
    method: 'PATCH',
    body: updateDataRequestStatusRequestSchema.parse(input),
  })
}

export function listFindings(
  transport: AuthenticatedTransport,
  projectId: string,
  query: FindingsQuery = {},
  options: { signal?: AbortSignal } = {},
) {
  const search = new URLSearchParams()
  const normalized = findingsQuerySchema.parse(query)
  if (normalized.domainId) search.set('domainId', normalized.domainId)
  if (normalized.priority) search.set('priority', normalized.priority)
  if (normalized.status) search.set('status', normalized.status)
  const qs = search.toString()
  return transport.request(
    `/api/projects/${id(projectId)}/findings${qs ? `?${qs}` : ''}`,
    findingsResponseSchema,
    options,
  )
}

export function listInterviews(
  transport: AuthenticatedTransport,
  projectId: string,
  query: InterviewsQuery = {},
  options: { signal?: AbortSignal } = {},
) {
  const search = new URLSearchParams()
  const normalized = interviewsQuerySchema.parse(query)
  if (normalized.status) search.set('status', normalized.status)
  if (normalized.domainId) search.set('domainId', normalized.domainId)
  const qs = search.toString()
  return transport.request(
    `/api/projects/${id(projectId)}/interviews${qs ? `?${qs}` : ''}`,
    interviewsResponseSchema,
    options,
  )
}

export function listGuides(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/projects/${id(projectId)}/guides`, guidesResponseSchema, options)
}

// ============================================================
// Приглашения (публичный эндпоинт: аккаунта ещё нет)
// ============================================================

/** Принятие приглашения без сессии: отдельный HttpClient, без Bearer-токена. */
export function acceptInvite(input: AcceptInviteRequest, http = new HttpClient()) {
  return http.request('/api/invites/accept', acceptInviteResponseSchema, {
    method: 'POST',
    body: acceptInviteRequestSchema.parse(input),
  })
}
