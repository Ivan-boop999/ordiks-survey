import {
  acceptInviteRequestSchema,
  acceptInviteResponseSchema,
  checklistItemSchema,
  createChecklistItemRequestSchema,
  createDataRequestRequestSchema,
  bulkUpdateFindingsRequestSchema,
  bulkUpdateFindingsResponseSchema,
  createDomainGroupRequestSchema,
  createDomainRequestSchema,
  createProjectRequestSchema,
  createStageRequestSchema,
  createTaskRequestSchema,
  createFactRequestSchema,
  createFindingRequestSchema,
  createInterviewRequestSchema,
  interviewDetailSchema,
  interviewSchema,
  saveInterviewAnswersRequestSchema,
  saveInterviewAnswersResponseSchema,
  updateInterviewRequestSchema,
  dataRequestSchema,
  factsResponseSchema,
  factSchema,
  findingSchema,
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
  updateDataRequestRequestSchema,
  updateDataRequestStatusRequestSchema,
  updateFactRequestSchema,
  updateFindingRequestSchema,
  updateDomainGroupRequestSchema,
  updateDomainRequestSchema,
  updateProjectRequestSchema,
  updateStageRequestSchema,
  updateTaskRequestSchema,
  createProcessRequestSchema,
  createProcessStepRequestSchema,
  processSchema,
  processSchemeDownloadSchema,
  processesResponseSchema,
  reorderProcessStepsRequestSchema,
  updateProcessRequestSchema,
  updateProcessStepRequestSchema,
  createGapRequestSchema,
  createRequirementRequestSchema,
  createRiskRequestSchema,
  gapSchema,
  gapsResponseSchema,
  requirementSchema,
  requirementsResponseSchema,
  riskSchema,
  risksResponseSchema,
  updateGapRequestSchema,
  updateRequirementRequestSchema,
  updateRiskRequestSchema,
  registriesResponseSchema,
  registrySchema,
  createRegistryRequestSchema,
  updateRegistryRequestSchema,
  createRegistryFieldRequestSchema,
  updateRegistryFieldRequestSchema,
  createRegistryStatusRequestSchema,
  updateRegistryStatusRequestSchema,
  registryStatusDeletedSchema,
  registryEntriesQuerySchema,
  registryEntriesResponseSchema,
  registryEntrySchema,
  createRegistryEntryRequestSchema,
  updateRegistryEntryRequestSchema,
  bulkRegistryEntriesRequestSchema,
  bulkRegistryEntriesResponseSchema,
  bulkDeleteRegistryEntriesRequestSchema,
  bulkDeleteRegistryEntriesResponseSchema,
  registryImportRequestSchema,
  registryImportResponseSchema,
  commentsResponseSchema,
  commentsQuerySchema,
  commentSchema,
  createCommentRequestSchema,
  decisionsResponseSchema,
  decisionSchema,
  createDecisionRequestSchema,
  updateDecisionRequestSchema,
  communicationsResponseSchema,
  communicationSchema,
  createCommunicationRequestSchema,
  updateCommunicationRequestSchema,
  quickWinsResponseSchema,
  quickWinSchema,
  createQuickWinRequestSchema,
  updateQuickWinRequestSchema,
  baselinesResponseSchema,
  baselineSchema,
  createBaselineRequestSchema,
  updateBaselineRequestSchema,
  createReportSectionRequestSchema,
  projectReportSchema,
  reportInsertRequestSchema,
  reportInsertResponseSchema,
  reportSectionSchema,
  sectionApprovalRequestSchema,
  updateReportSectionRequestSchema,
  markThreadReadRequestSchema,
  notificationsResponseSchema,
  createGuideRequestSchema,
  updateGuideRequestSchema,
  createGuideSectionRequestSchema,
  updateGuideSectionRequestSchema,
  createGuideQuestionRequestSchema,
  updateGuideQuestionRequestSchema,
  guideSchema,
  createProjectMemberRequestSchema,
  updateProjectMemberRequestSchema,
  projectMemberSchema,
  invitesResponseSchema,
  createInviteRequestSchema,
  inviteSchema,
  projectTemplatesResponseSchema,
  createProjectFromTemplateRequestSchema,
  type AcceptInviteRequest,
  type CreateChecklistItemRequest,
  type CreateDataRequestRequest,
  type BulkUpdateFindingsRequest,
  type CreateDomainGroupRequest,
  type CreateFactRequest,
  type CreateFindingRequest,
  type CreateInterviewRequest,
  type InterviewDetailDto,
  type SaveInterviewAnswersRequest,
  type UpdateInterviewRequest,
  type CreateDomainRequest,
  type CreateProjectRequest,
  type CreateStageRequest,
  type CreateTaskRequest,
  type DataRequestsQuery,
  type FindingsQuery,
  type InterviewsQuery,
  type TasksQuery,
  type UpdateChecklistItemRequest,
  type UpdateDataRequestRequest,
  type UpdateDataRequestStatusRequest,
  type UpdateFactRequest,
  type UpdateFindingRequest,
  type UpdateDomainGroupRequest,
  type UpdateDomainRequest,
  type UpdateProjectRequest,
  type UpdateStageRequest,
  type UpdateTaskRequest,
  type CreateProcessRequest,
  type CreateProcessStepRequest,
  type ProcessSide,
  type ProcessSchemeDownload,
  type ReorderProcessStepsRequest,
  type UpdateProcessRequest,
  type UpdateProcessStepRequest,
  type CreateGapRequest,
  type CreateRequirementRequest,
  type CreateRiskRequest,
  type UpdateGapRequest,
  type UpdateRequirementRequest,
  type UpdateRiskRequest,
  type CreateReportSectionRequest,
  type ReportInsertRequest,
  type SectionApprovalRequest,
  type UpdateReportSectionRequest,
  type MarkThreadReadRequest,
  type CommentsQuery,
  type CreateCommentRequest,
  type CreateRegistryRequest,
  type UpdateRegistryRequest,
  type CreateRegistryFieldRequest,
  type UpdateRegistryFieldRequest,
  type CreateRegistryStatusRequest,
  type UpdateRegistryStatusRequest,
  type RegistryEntriesQuery,
  type CreateRegistryEntryRequest,
  type UpdateRegistryEntryRequest,
  type BulkRegistryEntriesRequest,
  type BulkDeleteRegistryEntriesRequest,
  type RegistryImportRequest,
  type CreateDecisionRequest,
  type UpdateDecisionRequest,
  type CreateCommunicationRequest,
  type UpdateCommunicationRequest,
  type CreateQuickWinRequest,
  type UpdateQuickWinRequest,
  type CreateBaselineRequest,
  type UpdateBaselineRequest,
  type CreateGuideRequest,
  type UpdateGuideRequest,
  type CreateGuideSectionRequest,
  type UpdateGuideSectionRequest,
  type CreateGuideQuestionRequest,
  type UpdateGuideQuestionRequest,
  type CreateProjectMemberRequest,
  type CreateInviteRequest,
  type MemberRole,
  type CreateProjectFromTemplateRequest,
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

// ============================================================
// Запросы данных: создание/правка/удаление (команда)
// ============================================================

export function createDataRequest(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateDataRequestRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/requests`, dataRequestSchema, {
    method: 'POST',
    body: createDataRequestRequestSchema.parse(input),
  })
}

export function updateDataRequest(
  transport: AuthenticatedTransport,
  requestId: string,
  input: UpdateDataRequestRequest,
) {
  return transport.request(`/api/requests/${id(requestId)}`, dataRequestSchema, {
    method: 'PATCH',
    body: updateDataRequestRequestSchema.parse(input),
  })
}

export function deleteDataRequest(transport: AuthenticatedTransport, requestId: string) {
  return transport.request(`/api/requests/${id(requestId)}`, noContent, { method: 'DELETE' })
}

// ============================================================
// Находки: CRUD, bulk; факты: список (для связей-доказательств)
// ============================================================

export function createFinding(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateFindingRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/findings`, findingSchema, {
    method: 'POST',
    body: createFindingRequestSchema.parse(input),
  })
}

export function updateFinding(
  transport: AuthenticatedTransport,
  findingId: string,
  input: UpdateFindingRequest,
) {
  return transport.request(`/api/findings/${id(findingId)}`, findingSchema, {
    method: 'PATCH',
    body: updateFindingRequestSchema.parse(input),
  })
}

export function deleteFinding(transport: AuthenticatedTransport, findingId: string) {
  return transport.request(`/api/findings/${id(findingId)}`, noContent, { method: 'DELETE' })
}

export function bulkUpdateFindings(
  transport: AuthenticatedTransport,
  projectId: string,
  input: BulkUpdateFindingsRequest,
) {
  return transport.request(
    `/api/projects/${id(projectId)}/findings/bulk`,
    bulkUpdateFindingsResponseSchema,
    { method: 'POST', body: bulkUpdateFindingsRequestSchema.parse(input) },
  )
}

export function listFacts(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/projects/${id(projectId)}/facts`, factsResponseSchema, options)
}

export function factFileDownloadUrl(
  transport: AuthenticatedTransport,
  factId: string,
): Promise<{ url: string }> {
  return transport.request(`/api/facts/${id(factId)}/file/download`, z.object({ url: z.string() }))
}

// ============================================================
// Факты: CRUD (загрузка файла — fact-upload.ts)
// ============================================================

export function createFact(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateFactRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/facts`, factSchema, {
    method: 'POST',
    body: createFactRequestSchema.parse(input),
  })
}

export function updateFact(
  transport: AuthenticatedTransport,
  factId: string,
  input: UpdateFactRequest,
) {
  return transport.request(`/api/facts/${id(factId)}`, factSchema, {
    method: 'PATCH',
    body: updateFactRequestSchema.parse(input),
  })
}

export function deleteFact(transport: AuthenticatedTransport, factId: string) {
  return transport.request(`/api/facts/${id(factId)}`, noContent, { method: 'DELETE' })
}

// ============================================================
// Интервью: CRUD + гайд с деревом + ответы
// ============================================================

export function createInterview(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateInterviewRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/interviews`, interviewSchema, {
    method: 'POST',
    body: createInterviewRequestSchema.parse(input),
  })
}

export function getInterview(
  transport: AuthenticatedTransport,
  interviewId: string,
): Promise<InterviewDetailDto> {
  return transport.request(`/api/interviews/${id(interviewId)}`, interviewDetailSchema)
}

export function updateInterview(
  transport: AuthenticatedTransport,
  interviewId: string,
  input: UpdateInterviewRequest,
) {
  return transport.request(`/api/interviews/${id(interviewId)}`, interviewSchema, {
    method: 'PATCH',
    body: updateInterviewRequestSchema.parse(input),
  })
}

export function deleteInterview(transport: AuthenticatedTransport, interviewId: string) {
  return transport.request(`/api/interviews/${id(interviewId)}`, noContent, { method: 'DELETE' })
}

export function saveInterviewAnswers(
  transport: AuthenticatedTransport,
  interviewId: string,
  input: SaveInterviewAnswersRequest,
) {
  return transport.request(
    `/api/interviews/${id(interviewId)}/answers`,
    saveInterviewAnswersResponseSchema,
    { method: 'PUT', body: saveInterviewAnswersRequestSchema.parse(input) },
  )
}

// ============================================================
// Процессы AS-IS / TO-BE: шаги, порядок, схемы StormBPMN (загрузка — process-scheme-upload.ts)
// ============================================================

export function listProcesses(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(
    `/api/projects/${id(projectId)}/processes`,
    processesResponseSchema,
    options,
  )
}

export function createProcess(transport: AuthenticatedTransport, projectId: string, input: CreateProcessRequest) {
  return transport.request(`/api/projects/${id(projectId)}/processes`, processSchema, {
    method: 'POST',
    body: createProcessRequestSchema.parse(input),
  })
}

export function updateProcess(
  transport: AuthenticatedTransport,
  processId: string,
  input: UpdateProcessRequest,
) {
  return transport.request(`/api/processes/${id(processId)}`, processSchema, {
    method: 'PATCH',
    body: updateProcessRequestSchema.parse(input),
  })
}

export function deleteProcess(transport: AuthenticatedTransport, processId: string) {
  return transport.request(`/api/processes/${id(processId)}`, noContent, { method: 'DELETE' })
}

export function createProcessStep(
  transport: AuthenticatedTransport,
  processId: string,
  input: CreateProcessStepRequest,
) {
  return transport.request(`/api/processes/${id(processId)}/steps`, processSchema, {
    method: 'POST',
    body: createProcessStepRequestSchema.parse(input),
  })
}

export function reorderProcessSteps(
  transport: AuthenticatedTransport,
  processId: string,
  input: ReorderProcessStepsRequest,
) {
  return transport.request(`/api/processes/${id(processId)}/steps/reorder`, processSchema, {
    method: 'POST',
    body: reorderProcessStepsRequestSchema.parse(input),
  })
}

export function updateProcessStep(
  transport: AuthenticatedTransport,
  stepId: string,
  input: UpdateProcessStepRequest,
) {
  return transport.request(`/api/process-steps/${id(stepId)}`, processSchema, {
    method: 'PATCH',
    body: updateProcessStepRequestSchema.parse(input),
  })
}

export function deleteProcessStep(transport: AuthenticatedTransport, stepId: string) {
  return transport.request(`/api/process-steps/${id(stepId)}`, noContent, { method: 'DELETE' })
}

/** Схема лежит в приватном хранилище: превью получает по короткоживущей подписанной ссылке. */
export function processSchemeDownloadUrl(
  transport: AuthenticatedTransport,
  processId: string,
  side: ProcessSide,
): Promise<ProcessSchemeDownload> {
  return transport.request(
    `/api/processes/${id(processId)}/schemes/${side}/download`,
    processSchemeDownloadSchema,
  )
}

export function deleteProcessScheme(
  transport: AuthenticatedTransport,
  processId: string,
  side: ProcessSide,
) {
  return transport.request(`/api/processes/${id(processId)}/schemes/${side}`, processSchema, {
    method: 'DELETE',
  })
}

// ============================================================
// Аналитика: риски, GAP, требования
// ============================================================

export function listRisks(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/projects/${id(projectId)}/risks`, risksResponseSchema, options)
}

export function createRisk(transport: AuthenticatedTransport, projectId: string, input: CreateRiskRequest) {
  return transport.request(`/api/projects/${id(projectId)}/risks`, riskSchema, {
    method: 'POST',
    body: createRiskRequestSchema.parse(input),
  })
}

export function updateRisk(
  transport: AuthenticatedTransport,
  riskId: string,
  input: UpdateRiskRequest,
) {
  return transport.request(`/api/risks/${id(riskId)}`, riskSchema, {
    method: 'PATCH',
    body: updateRiskRequestSchema.parse(input),
  })
}

export function deleteRisk(transport: AuthenticatedTransport, riskId: string) {
  return transport.request(`/api/risks/${id(riskId)}`, noContent, { method: 'DELETE' })
}

export function listGaps(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/projects/${id(projectId)}/gaps`, gapsResponseSchema, options)
}

export function createGap(transport: AuthenticatedTransport, projectId: string, input: CreateGapRequest) {
  return transport.request(`/api/projects/${id(projectId)}/gaps`, gapSchema, {
    method: 'POST',
    body: createGapRequestSchema.parse(input),
  })
}

export function updateGap(
  transport: AuthenticatedTransport,
  gapId: string,
  input: UpdateGapRequest,
) {
  return transport.request(`/api/gaps/${id(gapId)}`, gapSchema, {
    method: 'PATCH',
    body: updateGapRequestSchema.parse(input),
  })
}

export function deleteGap(transport: AuthenticatedTransport, gapId: string) {
  return transport.request(`/api/gaps/${id(gapId)}`, noContent, { method: 'DELETE' })
}

export function listRequirements(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(
    `/api/projects/${id(projectId)}/requirements`,
    requirementsResponseSchema,
    options,
  )
}

export function createRequirement(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateRequirementRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/requirements`, requirementSchema, {
    method: 'POST',
    body: createRequirementRequestSchema.parse(input),
  })
}

export function updateRequirement(
  transport: AuthenticatedTransport,
  requirementId: string,
  input: UpdateRequirementRequest,
) {
  return transport.request(`/api/requirements/${id(requirementId)}`, requirementSchema, {
    method: 'PATCH',
    body: updateRequirementRequestSchema.parse(input),
  })
}

export function deleteRequirement(transport: AuthenticatedTransport, requirementId: string) {
  return transport.request(`/api/requirements/${id(requirementId)}`, noContent, {
    method: 'DELETE',
  })
}

/** Реестры проекта — для автовставки «Реестр рисков» и последующей волны конструктора. */
export function listRegistries(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/projects/${id(projectId)}/registries`, registriesResponseSchema, options)
}

// ============================================================
// Комментарии-треды (обсуждения фактов, находок, интервью, запросов…)
// ============================================================

export function listComments(
  transport: AuthenticatedTransport,
  projectId: string,
  query: CommentsQuery,
  options: { signal?: AbortSignal } = {},
) {
  const normalized = commentsQuerySchema.parse(query)
  const search = new URLSearchParams({
    threadType: normalized.threadType,
    threadId: normalized.threadId,
  })
  return transport.request(
    `/api/projects/${id(projectId)}/comments?${search.toString()}`,
    commentsResponseSchema,
    options,
  )
}

export function createComment(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateCommentRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/comments`, commentSchema, {
    method: 'POST',
    body: createCommentRequestSchema.parse(input),
  })
}

// ============================================================
// Свои реестры: конструктор (поля/статусы), записи, bulk, импорт
// ============================================================

export function getRegistry(
  transport: AuthenticatedTransport,
  registryId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/registries/${id(registryId)}`, registrySchema, options)
}

export function createRegistry(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateRegistryRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/registries`, registrySchema, {
    method: 'POST',
    body: createRegistryRequestSchema.parse(input),
  })
}

export function updateRegistry(
  transport: AuthenticatedTransport,
  registryId: string,
  input: UpdateRegistryRequest,
) {
  return transport.request(`/api/registries/${id(registryId)}`, registrySchema, {
    method: 'PATCH',
    body: updateRegistryRequestSchema.parse(input),
  })
}

export function deleteRegistry(transport: AuthenticatedTransport, registryId: string) {
  return transport.request(`/api/registries/${id(registryId)}`, noContent, { method: 'DELETE' })
}

export function createRegistryField(
  transport: AuthenticatedTransport,
  registryId: string,
  input: CreateRegistryFieldRequest,
) {
  return transport.request(`/api/registries/${id(registryId)}/fields`, registrySchema, {
    method: 'POST',
    body: createRegistryFieldRequestSchema.parse(input),
  })
}

export function updateRegistryField(
  transport: AuthenticatedTransport,
  fieldId: string,
  input: UpdateRegistryFieldRequest,
) {
  return transport.request(`/api/registry-fields/${id(fieldId)}`, registrySchema, {
    method: 'PATCH',
    body: updateRegistryFieldRequestSchema.parse(input),
  })
}

export function deleteRegistryField(transport: AuthenticatedTransport, fieldId: string) {
  return transport.request(`/api/registry-fields/${id(fieldId)}`, noContent, { method: 'DELETE' })
}

export function createRegistryStatus(
  transport: AuthenticatedTransport,
  registryId: string,
  input: CreateRegistryStatusRequest,
) {
  return transport.request(`/api/registries/${id(registryId)}/statuses`, registrySchema, {
    method: 'POST',
    body: createRegistryStatusRequestSchema.parse(input),
  })
}

export function updateRegistryStatus(
  transport: AuthenticatedTransport,
  statusId: string,
  input: UpdateRegistryStatusRequest,
) {
  return transport.request(`/api/registry-statuses/${id(statusId)}`, registrySchema, {
    method: 'PATCH',
    body: updateRegistryStatusRequestSchema.parse(input),
  })
}

/** Ответ удаления статуса: сколько записей переехали на первый оставшийся. */
export function deleteRegistryStatus(transport: AuthenticatedTransport, statusId: string) {
  return transport.request(`/api/registry-statuses/${id(statusId)}`, registryStatusDeletedSchema, {
    method: 'DELETE',
  })
}

export function listRegistryEntries(
  transport: AuthenticatedTransport,
  registryId: string,
  query: RegistryEntriesQuery = {},
  options: { signal?: AbortSignal } = {},
) {
  const search = new URLSearchParams()
  const normalized = registryEntriesQuerySchema.parse(query)
  if (normalized.statusId) search.set('statusId', normalized.statusId)
  if (normalized.q) search.set('q', normalized.q)
  const qs = search.toString()
  return transport.request(
    `/api/registries/${id(registryId)}/entries${qs ? `?${qs}` : ''}`,
    registryEntriesResponseSchema,
    options,
  )
}

export function createRegistryEntry(
  transport: AuthenticatedTransport,
  registryId: string,
  input: CreateRegistryEntryRequest,
) {
  return transport.request(`/api/registries/${id(registryId)}/entries`, registryEntrySchema, {
    method: 'POST',
    body: createRegistryEntryRequestSchema.parse(input),
  })
}

export function updateRegistryEntry(
  transport: AuthenticatedTransport,
  entryId: string,
  input: UpdateRegistryEntryRequest,
) {
  return transport.request(`/api/registry-entries/${id(entryId)}`, registryEntrySchema, {
    method: 'PATCH',
    body: updateRegistryEntryRequestSchema.parse(input),
  })
}

export function deleteRegistryEntry(transport: AuthenticatedTransport, entryId: string) {
  return transport.request(`/api/registry-entries/${id(entryId)}`, noContent, { method: 'DELETE' })
}

export function bulkStatusRegistryEntries(
  transport: AuthenticatedTransport,
  registryId: string,
  input: BulkRegistryEntriesRequest,
) {
  return transport.request(
    `/api/registries/${id(registryId)}/entries/bulk-status`,
    bulkRegistryEntriesResponseSchema,
    { method: 'POST', body: bulkRegistryEntriesRequestSchema.parse(input) },
  )
}

export function bulkDeleteRegistryEntries(
  transport: AuthenticatedTransport,
  registryId: string,
  input: BulkDeleteRegistryEntriesRequest,
) {
  return transport.request(
    `/api/registries/${id(registryId)}/entries/bulk-delete`,
    bulkDeleteRegistryEntriesResponseSchema,
    { method: 'POST', body: bulkDeleteRegistryEntriesRequestSchema.parse(input) },
  )
}

export function importRegistryEntries(
  transport: AuthenticatedTransport,
  registryId: string,
  input: RegistryImportRequest,
) {
  return transport.request(
    `/api/registries/${id(registryId)}/import`,
    registryImportResponseSchema,
    { method: 'POST', body: registryImportRequestSchema.parse(input) },
  )
}

// ============================================================
// Аналитика: решения, коммуникации, quick wins, базлайны
// ============================================================

export function listDecisions(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/projects/${id(projectId)}/decisions`, decisionsResponseSchema, options)
}

export function createDecision(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateDecisionRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/decisions`, decisionSchema, {
    method: 'POST',
    body: createDecisionRequestSchema.parse(input),
  })
}

export function updateDecision(
  transport: AuthenticatedTransport,
  decisionId: string,
  input: UpdateDecisionRequest,
) {
  return transport.request(`/api/decisions/${id(decisionId)}`, decisionSchema, {
    method: 'PATCH',
    body: updateDecisionRequestSchema.parse(input),
  })
}

export function deleteDecision(transport: AuthenticatedTransport, decisionId: string) {
  return transport.request(`/api/decisions/${id(decisionId)}`, noContent, { method: 'DELETE' })
}

export function listCommunications(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(
    `/api/projects/${id(projectId)}/communications`,
    communicationsResponseSchema,
    options,
  )
}

export function createCommunication(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateCommunicationRequest,
) {
  return transport.request(
    `/api/projects/${id(projectId)}/communications`,
    communicationSchema,
    { method: 'POST', body: createCommunicationRequestSchema.parse(input) },
  )
}

export function updateCommunication(
  transport: AuthenticatedTransport,
  communicationId: string,
  input: UpdateCommunicationRequest,
) {
  return transport.request(
    `/api/communications/${id(communicationId)}`,
    communicationSchema,
    { method: 'PATCH', body: updateCommunicationRequestSchema.parse(input) },
  )
}

export function deleteCommunication(transport: AuthenticatedTransport, communicationId: string) {
  return transport.request(`/api/communications/${id(communicationId)}`, noContent, {
    method: 'DELETE',
  })
}

export function listQuickWins(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(
    `/api/projects/${id(projectId)}/quick-wins`,
    quickWinsResponseSchema,
    options,
  )
}

export function createQuickWin(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateQuickWinRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/quick-wins`, quickWinSchema, {
    method: 'POST',
    body: createQuickWinRequestSchema.parse(input),
  })
}

export function updateQuickWin(
  transport: AuthenticatedTransport,
  quickWinId: string,
  input: UpdateQuickWinRequest,
) {
  return transport.request(`/api/quick-wins/${id(quickWinId)}`, quickWinSchema, {
    method: 'PATCH',
    body: updateQuickWinRequestSchema.parse(input),
  })
}

export function deleteQuickWin(transport: AuthenticatedTransport, quickWinId: string) {
  return transport.request(`/api/quick-wins/${id(quickWinId)}`, noContent, { method: 'DELETE' })
}

export function listBaselines(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/projects/${id(projectId)}/baselines`, baselinesResponseSchema, options)
}

export function createBaseline(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateBaselineRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/baselines`, baselineSchema, {
    method: 'POST',
    body: createBaselineRequestSchema.parse(input),
  })
}

export function updateBaseline(
  transport: AuthenticatedTransport,
  baselineId: string,
  input: UpdateBaselineRequest,
) {
  return transport.request(`/api/baselines/${id(baselineId)}`, baselineSchema, {
    method: 'PATCH',
    body: updateBaselineRequestSchema.parse(input),
  })
}

export function deleteBaseline(transport: AuthenticatedTransport, baselineId: string) {
  return transport.request(`/api/baselines/${id(baselineId)}`, noContent, { method: 'DELETE' })
}

// ============================================================
// Отчёт: разделы, автовставки, визы
// ============================================================

export function getProjectReport(
  transport: AuthenticatedTransport,
  projectId: string,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request(`/api/projects/${id(projectId)}/report`, projectReportSchema, options)
}

export function insertReportFragment(
  transport: AuthenticatedTransport,
  projectId: string,
  input: ReportInsertRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/report/insert`, reportInsertResponseSchema, {
    method: 'POST',
    body: reportInsertRequestSchema.parse(input),
  })
}

export function createReportSection(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateReportSectionRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/report/sections`, reportSectionSchema, {
    method: 'POST',
    body: createReportSectionRequestSchema.parse(input),
  })
}

export function updateReportSection(
  transport: AuthenticatedTransport,
  sectionId: string,
  input: UpdateReportSectionRequest,
) {
  return transport.request(`/api/report-sections/${id(sectionId)}`, reportSectionSchema, {
    method: 'PATCH',
    body: updateReportSectionRequestSchema.parse(input),
  })
}

export function deleteReportSection(transport: AuthenticatedTransport, sectionId: string) {
  return transport.request(`/api/report-sections/${id(sectionId)}`, noContent, { method: 'DELETE' })
}

export function approveReportSection(
  transport: AuthenticatedTransport,
  sectionId: string,
  input: SectionApprovalRequest,
) {
  return transport.request(`/api/report-sections/${id(sectionId)}/approval`, reportSectionSchema, {
    method: 'PUT',
    body: sectionApprovalRequestSchema.parse(input),
  })
}

// ============================================================
// Центр уведомлений: непрочитанные комментарии и отметка треда прочитанным
// ============================================================

export function listNotifications(
  transport: AuthenticatedTransport,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request('/api/me/notifications', notificationsResponseSchema, options)
}

export function markThreadRead(
  transport: AuthenticatedTransport,
  input: MarkThreadReadRequest,
) {
  return transport.request('/api/me/notifications/read', noContent, {
    method: 'POST',
    body: markThreadReadRequestSchema.parse(input),
  })
}

// ============================================================
// Гайды: конструктор — CRUD секций/вопросов, дублирование
// ============================================================

export function createGuide(transport: AuthenticatedTransport, projectId: string, input: CreateGuideRequest) {
  return transport.request(`/api/projects/${id(projectId)}/guides`, guideSchema, {
    method: 'POST',
    body: createGuideRequestSchema.parse(input),
  })
}

export function updateGuide(transport: AuthenticatedTransport, guideId: string, input: UpdateGuideRequest) {
  return transport.request(`/api/guides/${id(guideId)}`, guideSchema, {
    method: 'PATCH',
    body: updateGuideRequestSchema.parse(input),
  })
}

export function deleteGuide(transport: AuthenticatedTransport, guideId: string) {
  return transport.request(`/api/guides/${id(guideId)}`, noContent, { method: 'DELETE' })
}

export function duplicateGuide(transport: AuthenticatedTransport, guideId: string) {
  return transport.request(`/api/guides/${id(guideId)}/duplicate`, guideSchema, { method: 'POST' })
}

export function createGuideSection(
  transport: AuthenticatedTransport,
  guideId: string,
  input: CreateGuideSectionRequest,
) {
  return transport.request(`/api/guides/${id(guideId)}/sections`, guideSchema, {
    method: 'POST',
    body: createGuideSectionRequestSchema.parse(input),
  })
}

export function updateGuideSection(
  transport: AuthenticatedTransport,
  sectionId: string,
  input: UpdateGuideSectionRequest,
) {
  return transport.request(`/api/guide-sections/${id(sectionId)}`, guideSchema, {
    method: 'PATCH',
    body: updateGuideSectionRequestSchema.parse(input),
  })
}

export function deleteGuideSection(transport: AuthenticatedTransport, sectionId: string) {
  return transport.request(`/api/guide-sections/${id(sectionId)}`, noContent, { method: 'DELETE' })
}

export function createGuideQuestion(
  transport: AuthenticatedTransport,
  sectionId: string,
  input: CreateGuideQuestionRequest,
) {
  return transport.request(`/api/guide-sections/${id(sectionId)}/questions`, guideSchema, {
    method: 'POST',
    body: createGuideQuestionRequestSchema.parse(input),
  })
}

export function updateGuideQuestion(
  transport: AuthenticatedTransport,
  questionId: string,
  input: UpdateGuideQuestionRequest,
) {
  return transport.request(`/api/guide-questions/${id(questionId)}`, guideSchema, {
    method: 'PATCH',
    body: updateGuideQuestionRequestSchema.parse(input),
  })
}

export function deleteGuideQuestion(transport: AuthenticatedTransport, questionId: string) {
  return transport.request(`/api/guide-questions/${id(questionId)}`, noContent, { method: 'DELETE' })
}

// ============================================================
// Участники проекта: добавление существующего, роль, удаление
// ============================================================

export function addProjectMember(
  transport: AuthenticatedTransport,
  projectId: string,
  input: CreateProjectMemberRequest,
) {
  return transport.request(`/api/projects/${id(projectId)}/members`, projectMemberSchema, {
    method: 'POST',
    body: createProjectMemberRequestSchema.parse(input),
  })
}

export function updateProjectMemberRole(
  transport: AuthenticatedTransport,
  projectId: string,
  memberId: string,
  role: MemberRole,
) {
  return transport.request(
    `/api/projects/${id(projectId)}/members/${id(memberId)}`,
    projectMemberSchema,
    { method: 'PATCH', body: updateProjectMemberRequestSchema.parse({ role }) },
  )
}

export function removeProjectMember(
  transport: AuthenticatedTransport,
  projectId: string,
  memberId: string,
) {
  return transport.request(
    `/api/projects/${id(projectId)}/members/${id(memberId)}`,
    noContent,
    { method: 'DELETE' },
  )
}

// ============================================================
// Приглашения (управление; принятие — acceptInvite выше)
// ============================================================

export function listInvites(
  transport: AuthenticatedTransport,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request('/api/invites', invitesResponseSchema, options)
}

export function createInvite(transport: AuthenticatedTransport, input: CreateInviteRequest) {
  return transport.request('/api/invites', inviteSchema, {
    method: 'POST',
    body: createInviteRequestSchema.parse(input),
  })
}

export function deactivateInvite(transport: AuthenticatedTransport, inviteId: string) {
  return transport.request(`/api/invites/${id(inviteId)}`, inviteSchema, { method: 'DELETE' })
}

// ============================================================
// Библиотека методик: шаблоны проектов
// ============================================================

export function listProjectTemplates(
  transport: AuthenticatedTransport,
  options: { signal?: AbortSignal } = {},
) {
  return transport.request('/api/project-templates', projectTemplatesResponseSchema, options)
}

export function createProjectFromTemplate(
  transport: AuthenticatedTransport,
  input: CreateProjectFromTemplateRequest,
) {
  return transport.request('/api/projects/from-template', projectDetailSchema, {
    method: 'POST',
    body: createProjectFromTemplateRequestSchema.parse(input),
  })
}
