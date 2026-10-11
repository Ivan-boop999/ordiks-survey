import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type {
  CreateChecklistItemRequest,
  BulkUpdateFindingsRequest,
  CreateDataRequestRequest,
  CreateFactRequest,
  CreateFindingRequest,
  CreateGapRequest,
  CreateGuideQuestionRequest,
  CreateGuideRequest,
  CreateGuideSectionRequest,
  GuideQuestionDto,
  GuideSectionDto,
  CreateInterviewRequest,
  CreateProcessRequest,
  CreateProcessStepRequest,
  CreateRegistryRequest,
  CreateRegistryEntryRequest,
  CreateRegistryFieldRequest,
  CreateRegistryStatusRequest,
  RegistryImportRequest,
  CreateReportSectionRequest,
  CreateRequirementRequest,
  CreateRiskRequest,
  CreateDecisionRequest,
  CreateCommunicationRequest,
  CreateQuickWinRequest,
  CreateBaselineRequest,
  MarkThreadReadRequest,
  RegistryEntriesQuery,
  ReportInsertRequest,
  SaveInterviewAnswersRequest,
  SectionApprovalRequest,
  UpdateInterviewRequest,
  UpdateFactRequest,
  UpdateFindingRequest,
  UpdateGapRequest,
  UpdateGuideQuestionRequest,
  UpdateGuideRequest,
  UpdateGuideSectionRequest,
  UpdateProcessRequest,
  UpdateProcessStepRequest,
  UpdateRegistryRequest,
  UpdateRegistryEntryRequest,
  UpdateRegistryFieldRequest,
  UpdateRegistryStatusRequest,
  UpdateReportSectionRequest,
  UpdateRequirementRequest,
  UpdateRiskRequest,
  UpdateDecisionRequest,
  UpdateCommunicationRequest,
  UpdateQuickWinRequest,
  UpdateBaselineRequest,
  CreateDomainGroupRequest,
  CreateDomainRequest,
  CreateInviteRequest,
  CreateProjectFromTemplateRequest,
  CreateProjectMemberRequest,
  CreateProjectRequest,
  CreateStageRequest,
  CreateTaskRequest,
  MemberRole,
  ProjectSummary,
  RequestStatus,
  StageDto,
  TaskDto,
  TaskStatus,
  ThreadType,
  UpdateChecklistItemRequest,
  UpdateDataRequestRequest,
  UpdateDomainGroupRequest,
  UpdateDomainRequest,
  UpdateProjectRequest,
  UpdateStageRequest,
  UpdateTaskRequest,
} from '@ordiks-survey/contracts'

import { uploadFactFile } from './fact-upload'
import { uploadProcessScheme } from './process-scheme-upload'
import { useAuth } from '@/features/auth'
import type { AuthenticatedTransport } from '@/platform/api'
import {
  addProjectMember,
  approveReportSection,
  archiveProject,
  bulkUpdateFindings,
  createChecklistItem,
  createComment,
  createDataRequest,
  createFact,
  createFinding,
  createGap,
  createGuide,
  createGuideQuestion,
  createGuideSection,
  createInterview,
  createInvite,
  createProcess,
  createProcessStep,
  createProjectFromTemplate,
  createRegistry,
  createRegistryEntry,
  createRegistryField,
  createRegistryStatus,
  createReportSection,
  createRequirement,
  createRisk,
  createDecision,
  createCommunication,
  createQuickWin,
  createBaseline,
  deactivateInvite,
  deleteInterview,
  deleteProcess,
  deleteProcessStep,
  deleteProcessScheme,
  deleteReportSection,
  deleteGap,
  deleteGuide,
  deleteGuideQuestion,
  deleteGuideSection,
  deleteRequirement,
  deleteRisk,
  deleteRegistry,
  deleteRegistryEntry,
  deleteRegistryField,
  deleteRegistryStatus,
  deleteDecision,
  deleteCommunication,
  deleteQuickWin,
  deleteBaseline,
  importRegistryEntries,
  saveInterviewAnswers,
  duplicateGuide,
  insertReportFragment,
  listComments,
  updateInterview,
  deleteFact,
  deleteFinding,
  updateFact,
  updateFinding,
  updateGap,
  updateGuide,
  updateGuideQuestion,
  updateGuideSection,
  updateProcess,
  updateProcessStep,
  updateRegistry,
  updateRegistryEntry,
  updateRegistryField,
  updateRegistryStatus,
  updateDecision,
  updateCommunication,
  updateQuickWin,
  updateBaseline,
  updateReportSection,
  updateRequirement,
  updateRisk,
  bulkDeleteRegistryEntries,
  bulkStatusRegistryEntries,
  createDomain,
  createDomainGroup,
  createProject,
  createStage,
  createTask,
  deleteChecklistItem,
  deleteDataRequest,
  deleteDomain,
  deleteDomainGroup,
  deleteStage,
  deleteTask,
  factFileDownloadUrl,
  getProject,
  getProjectReport,
  listDomainGroups,
  listDataRequests,
  listDecisions,
  listCommunications,
  listQuickWins,
  listBaselines,
  listFacts,
  listFindings,
  listGaps,
  listGuides,
  listInterviews,
  listInvites,
  listNotifications,
  listProcesses,
  listProjectMembers,
  listProjectTemplates,
  listProjects,
  listRegistries,
  listRegistryEntries,
  listRequirements,
  listRisks,
  listStages,
  listTasks,
  markThreadRead,
  removeProjectMember,
  reorderProcessSteps,
  updateChecklistItem,
  updateDataRequest,
  updateDataRequestStatus,
  updateDomain,
  updateDomainGroup,
  updateProject,
  updateProjectMemberRole,
  updateStage,
  updateTask,
} from './api'

// Ключи сессии шаблона: после входа/выхода кэш чистится вместе с ['session'] целиком.
export const surveyQueryKeys = {
  all: ['session', 'survey'] as const,
  projects: () => [...surveyQueryKeys.all, 'projects'] as const,
  project: (projectId: string) => [...surveyQueryKeys.all, 'project', projectId] as const,
  members: (projectId: string) => [...surveyQueryKeys.project(projectId), 'members'] as const,
  stages: (projectId: string) => [...surveyQueryKeys.project(projectId), 'stages'] as const,
  tasks: (projectId: string) => [...surveyQueryKeys.project(projectId), 'tasks'] as const,
  domains: (projectId: string) => [...surveyQueryKeys.project(projectId), 'domains'] as const,
  requests: (projectId: string) => [...surveyQueryKeys.project(projectId), 'requests'] as const,
  findings: (projectId: string) => [...surveyQueryKeys.project(projectId), 'findings'] as const,
  interviews: (projectId: string) => [...surveyQueryKeys.project(projectId), 'interviews'] as const,
  processes: (projectId: string) => [...surveyQueryKeys.project(projectId), 'processes'] as const,
  risks: (projectId: string) => [...surveyQueryKeys.project(projectId), 'risks'] as const,
  gaps: (projectId: string) => [...surveyQueryKeys.project(projectId), 'gaps'] as const,
  requirements: (projectId: string) => [...surveyQueryKeys.project(projectId), 'requirements'] as const,
  registries: (projectId: string) => [...surveyQueryKeys.project(projectId), 'registries'] as const,
  /** Корень одного реестра: структура + записи (префикс для точечной инвалидации). */
  registry: (registryId: string) => [...surveyQueryKeys.all, 'registry', registryId] as const,
  registryEntries: (registryId: string) => [...surveyQueryKeys.registry(registryId), 'entries'] as const,
  decisions: (projectId: string) => [...surveyQueryKeys.project(projectId), 'decisions'] as const,
  communications: (projectId: string) => [...surveyQueryKeys.project(projectId), 'communications'] as const,
  quickWins: (projectId: string) => [...surveyQueryKeys.project(projectId), 'quick-wins'] as const,
  baselines: (projectId: string) => [...surveyQueryKeys.project(projectId), 'baselines'] as const,
  comments: (projectId: string, threadType: ThreadType, threadId: string) =>
    [...surveyQueryKeys.project(projectId), 'comments', threadType, threadId] as const,
  report: (projectId: string) => [...surveyQueryKeys.project(projectId), 'report'] as const,
  guides: (projectId: string) => [...surveyQueryKeys.project(projectId), 'guides'] as const,
  invites: () => [...surveyQueryKeys.all, 'invites'] as const,
  projectTemplates: () => [...surveyQueryKeys.all, 'project-templates'] as const,
  notifications: () => [...surveyQueryKeys.all, 'notifications'] as const,
}

// ============================================================
// Чтение
// ============================================================

/** Прогресс покрытия проекта: доля отмеченных пунктов чек-листов всех доменов. */
export function useProjectCoverage(projectId: string) {
  const auth = useAuth()
  const domainsQuery = useQuery(domainGroupsQueryOptions(auth.transport, projectId))
  const groups = domainsQuery.data?.items ?? []
  let done = 0
  let total = 0
  for (const group of groups) {
    for (const domain of group.domains) {
      for (const item of domain.checklist) {
        total += 1
        if (item.done) done += 1
      }
    }
  }
  return {
    done,
    total,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    isLoading: domainsQuery.isPending,
  }
}

export function projectsQueryOptions(transport: AuthenticatedTransport) {
  return queryOptions({
    queryKey: surveyQueryKeys.projects(),
    queryFn: ({ signal }) => listProjects(transport, { signal }),
  })
}

export function useProjectsQuery() {
  const auth = useAuth()
  return useQuery(projectsQueryOptions(auth.transport))
}

export function projectQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.project(projectId),
    queryFn: ({ signal }) => getProject(transport, projectId, { signal }),
  })
}

export function useProjectQuery(projectId: string, enabled = true) {
  const auth = useAuth()
  return useQuery({
    ...projectQueryOptions(auth.transport, projectId),
    enabled: enabled && projectId.length > 0,
  })
}

export function membersQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.members(projectId),
    queryFn: ({ signal }) => listProjectMembers(transport, projectId, { signal }),
  })
}

export function useMembersQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(membersQueryOptions(auth.transport, projectId))
}

export function stagesQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.stages(projectId),
    queryFn: ({ signal }) => listStages(transport, projectId, { signal }),
  })
}

export function useStagesQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(stagesQueryOptions(auth.transport, projectId))
}

export function tasksQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.tasks(projectId),
    queryFn: ({ signal }) => listTasks(transport, projectId, {}, { signal }),
  })
}

export function useTasksQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(tasksQueryOptions(auth.transport, projectId))
}

export function domainGroupsQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.domains(projectId),
    queryFn: ({ signal }) => listDomainGroups(transport, projectId, { signal }),
  })
}

export function useDomainGroupsQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(domainGroupsQueryOptions(auth.transport, projectId))
}

export function dataRequestsQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.requests(projectId),
    queryFn: ({ signal }) => listDataRequests(transport, projectId, {}, { signal }),
  })
}

export function useDataRequestsQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(dataRequestsQueryOptions(auth.transport, projectId))
}

export function findingsQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.findings(projectId),
    queryFn: ({ signal }) => listFindings(transport, projectId, {}, { signal }),
  })
}

export function useFindingsQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(findingsQueryOptions(auth.transport, projectId))
}

export function interviewsQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.interviews(projectId),
    queryFn: ({ signal }) => listInterviews(transport, projectId, {}, { signal }),
  })
}

export function useInterviewsQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(interviewsQueryOptions(auth.transport, projectId))
}

// ============================================================
// Мутации
// ============================================================

function useSurveyMutation<TInput, TOutput>(
  mutate: (transport: AuthenticatedTransport, input: TInput) => Promise<TOutput>,
  invalidates: (input: TInput) => ReadonlyArray<readonly unknown[]>,
) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => mutate(auth.transport, input),
    onSuccess: async (_data, input) => {
      await Promise.all(
        invalidates(input).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: queryKey as unknown as readonly unknown[] }),
        ),
      )
    },
  })
}

// --- Проекты ---

export function useCreateProjectMutation() {
  const result = useSurveyMutation(
    (transport, input: CreateProjectRequest) => createProject(transport, input),
    () => [surveyQueryKeys.projects()],
  )
  return result
}

export function useUpdateProjectMutation() {
  return useSurveyMutation(
    (transport, { projectId, input }: { projectId: string; input: UpdateProjectRequest }) =>
      updateProject(transport, projectId, input),
    ({ projectId }) => [surveyQueryKeys.project(projectId), surveyQueryKeys.projects()],
  )
}

export function useArchiveProjectMutation() {
  return useSurveyMutation(
    (
      transport,
      { projectId, status }: { projectId: string; status: ProjectSummary['status'] },
    ) => archiveProject(transport, projectId, status),
    ({ projectId }) => [surveyQueryKeys.project(projectId), surveyQueryKeys.projects()],
  )
}

// --- Этапы ---

export function useCreateStageMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateStageRequest) => createStage(transport, projectId, input),
    () => [surveyQueryKeys.stages(projectId)],
  )
}

export function useUpdateStageMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { stageId, input }: { stageId: string; input: UpdateStageRequest }) =>
      updateStage(transport, stageId, input),
    () => [surveyQueryKeys.stages(projectId)],
  )
}

export function useDeleteStageMutation(projectId: string) {
  return useSurveyMutation(
    (transport, stageId: string) => deleteStage(transport, stageId),
    () => [surveyQueryKeys.stages(projectId), surveyQueryKeys.tasks(projectId)],
  )
}

export function useMoveStageMutation(projectId: string) {
  // Перестановка соседей: сервер считает sortOrder целым числом, свапаем значения.
  // Optimistic: карточки меняются местами мгновенно, при ошибке порядок откатывается.
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      stages,
      index,
      direction,
    }: {
      stages: StageDto[]
      index: number
      direction: -1 | 1
    }) => {
      const target = stages[index]
      const neighbor = stages[index + direction]
      if (!target || !neighbor) return Promise.resolve(null)
      return Promise.all([
        updateStage(auth.transport, target.id, { sortOrder: neighbor.sortOrder }),
        updateStage(auth.transport, neighbor.id, { sortOrder: target.sortOrder }),
      ])
    },
    onMutate: ({ stages, index, direction }) => {
      const previous = queryClient.getQueryData<{ items: StageDto[] }>(
        surveyQueryKeys.stages(projectId),
      )
      const target = stages[index]
      const neighbor = stages[index + direction]
      if (previous && target && neighbor) {
        queryClient.setQueryData(surveyQueryKeys.stages(projectId), {
          ...previous,
          items: previous.items.map((stage) =>
            stage.id === target.id
              ? { ...stage, sortOrder: neighbor.sortOrder }
              : stage.id === neighbor.id
                ? { ...stage, sortOrder: target.sortOrder }
                : stage,
          ),
        })
      }
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(surveyQueryKeys.stages(projectId), context.previous)
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: surveyQueryKeys.stages(projectId) }),
  })
}

// --- Задачи ---

export function useCreateTaskMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateTaskRequest) => createTask(transport, projectId, input),
    () => [surveyQueryKeys.tasks(projectId)],
  )
}

export function useUpdateTaskMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { taskId, input }: { taskId: string; input: UpdateTaskRequest }) =>
      updateTask(transport, taskId, input),
    () => [surveyQueryKeys.tasks(projectId)],
  )
}

export function useMoveTaskMutation(projectId: string) {
  // Optimistic-перенос в канбане: статус меняется в кэше мгновенно, при ошибке — откат.
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      updateTask(auth.transport, taskId, { status }),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: surveyQueryKeys.tasks(projectId) })
      const previous = queryClient.getQueryData<{ items: TaskDto[] }>(
        surveyQueryKeys.tasks(projectId),
      )
      if (previous) {
        queryClient.setQueryData(surveyQueryKeys.tasks(projectId), {
          ...previous,
          items: previous.items.map((task) =>
            task.id === taskId ? { ...task, status } : task,
          ),
        })
      }
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(surveyQueryKeys.tasks(projectId), context.previous)
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: surveyQueryKeys.tasks(projectId) }),
  })
}

export function useDeleteTaskMutation(projectId: string) {
  return useSurveyMutation(
    (transport, taskId: string) => deleteTask(transport, taskId),
    () => [surveyQueryKeys.tasks(projectId)],
  )
}

// --- Домены и чек-листы ---

export function useCreateDomainGroupMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateDomainGroupRequest) => createDomainGroup(transport, projectId, input),
    () => [surveyQueryKeys.domains(projectId)],
  )
}

export function useUpdateDomainGroupMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { groupId, input }: { groupId: string; input: UpdateDomainGroupRequest },
    ) => updateDomainGroup(transport, groupId, input),
    () => [surveyQueryKeys.domains(projectId)],
  )
}

export function useDeleteDomainGroupMutation(projectId: string) {
  return useSurveyMutation(
    (transport, groupId: string) => deleteDomainGroup(transport, groupId),
    () => [surveyQueryKeys.domains(projectId)],
  )
}

export function useCreateDomainMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateDomainRequest) => createDomain(transport, projectId, input),
    () => [surveyQueryKeys.domains(projectId)],
  )
}

export function useUpdateDomainMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { domainId, input }: { domainId: string; input: UpdateDomainRequest }) =>
      updateDomain(transport, domainId, input),
    () => [surveyQueryKeys.domains(projectId)],
  )
}

export function useDeleteDomainMutation(projectId: string) {
  return useSurveyMutation(
    (transport, domainId: string) => deleteDomain(transport, domainId),
    () => [surveyQueryKeys.domains(projectId)],
  )
}

export function useCreateChecklistItemMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { domainId, input }: { domainId: string; input: CreateChecklistItemRequest },
    ) => createChecklistItem(transport, domainId, input),
    () => [surveyQueryKeys.domains(projectId)],
  )
}

export function useUpdateChecklistItemMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { itemId, input }: { itemId: string; input: UpdateChecklistItemRequest },
    ) => updateChecklistItem(transport, itemId, input),
    () => [surveyQueryKeys.domains(projectId)],
  )
}

export function useDeleteChecklistItemMutation(projectId: string) {
  return useSurveyMutation(
    (transport, itemId: string) => deleteChecklistItem(transport, itemId),
    () => [surveyQueryKeys.domains(projectId)],
  )
}

// --- Запросы данных ---

export function useUpdateRequestStatusMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { requestId, status }: { requestId: string; status: RequestStatus },
    ) => updateDataRequestStatus(transport, requestId, { status }),
    () => [surveyQueryKeys.requests(projectId)],
  )
}

export function useCreateDataRequestMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateDataRequestRequest) => createDataRequest(transport, projectId, input),
    () => [surveyQueryKeys.requests(projectId)],
  )
}

export function useUpdateDataRequestMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { requestId, ...input }: { requestId: string } & UpdateDataRequestRequest) =>
      updateDataRequest(transport, requestId, input),
    () => [surveyQueryKeys.requests(projectId)],
  )
}

export function useDeleteDataRequestMutation(projectId: string) {
  return useSurveyMutation(
    (transport, requestId: string) => deleteDataRequest(transport, requestId),
    () => [surveyQueryKeys.requests(projectId)],
  )
}

export function useCreateFindingMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateFindingRequest) => createFinding(transport, projectId, input),
    () => [surveyQueryKeys.findings(projectId)],
  )
}

export function useUpdateFindingMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { findingId, ...input }: { findingId: string } & UpdateFindingRequest) =>
      updateFinding(transport, findingId, input),
    () => [surveyQueryKeys.findings(projectId)],
  )
}

export function useDeleteFindingMutation(projectId: string) {
  return useSurveyMutation(
    (transport, findingId: string) => deleteFinding(transport, findingId),
    () => [surveyQueryKeys.findings(projectId)],
  )
}

export function useBulkUpdateFindingsMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: BulkUpdateFindingsRequest) => bulkUpdateFindings(transport, projectId, input),
    () => [surveyQueryKeys.findings(projectId)],
  )
}

export function factsQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: [...surveyQueryKeys.project(projectId), 'facts'] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => listFacts(transport, projectId, { signal }),
  })
}

export function useFactsQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(factsQueryOptions(auth.transport, projectId))
}

export function useCreateFactMutation(projectId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFactRequest) => createFact(auth.transport, projectId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: surveyQueryKeys.project(projectId) }),
  })
}

export function useUpdateFactMutation(projectId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ factId, ...input }: { factId: string } & UpdateFactRequest) =>
      updateFact(auth.transport, factId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: surveyQueryKeys.project(projectId) }),
  })
}

export function useUploadFactFileMutation(projectId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ factId, file }: { factId: string; file: File }) =>
      uploadFactFile(auth.transport, factId, file),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: surveyQueryKeys.project(projectId) }),
  })
}

export function useDeleteFactMutation(projectId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (factId: string) => deleteFact(auth.transport, factId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: surveyQueryKeys.project(projectId) }),
  })
}

/**
 * Подписанный URL файла факта через react-query: URL живёт ~1 ч, поэтому кэшируем на
 * 45 минут — ре-рендеры сетки и повторные открытия карточек больше не ходят сетью
 * (аудит: 50 фактов = 50 запросов подписи на каждый рендер).
 */
export function useFactFileUrlQuery(factId: string, objectKey: string | null) {
  const auth = useAuth()
  return useQuery({
    queryKey: ['fact-file-url', factId, objectKey],
    queryFn: () => factFileDownloadUrl(auth.transport, factId),
    enabled: factId.length > 0 && objectKey !== null,
    staleTime: 45 * 60_000,
    gcTime: 60 * 60_000,
  })
}

export function useCreateInterviewMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateInterviewRequest) => createInterview(transport, projectId, input),
    () => [surveyQueryKeys.interviews(projectId)],
  )
}

export function useUpdateInterviewMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { interviewId, ...input }: { interviewId: string } & UpdateInterviewRequest) =>
      updateInterview(transport, interviewId, input),
    () => [surveyQueryKeys.interviews(projectId)],
  )
}

export function useDeleteInterviewMutation(projectId: string) {
  return useSurveyMutation(
    (transport, interviewId: string) => deleteInterview(transport, interviewId),
    () => [surveyQueryKeys.interviews(projectId)],
  )
}

export function useSaveAnswersMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { interviewId, answers }: { interviewId: string; answers: SaveInterviewAnswersRequest['answers'] },
    ) => saveInterviewAnswers(transport, interviewId, { answers }),
    () => [surveyQueryKeys.interviews(projectId)],
  )
}

export function useGuidesQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(guidesQueryOptions(auth.transport, projectId))
}

function guidesQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.guides(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      listGuides(transport, projectId, { signal }),
  })
}

// ============================================================
// Процессы AS-IS / TO-BE
// ============================================================

export function processesQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.processes(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) => listProcesses(transport, projectId, { signal }),
  })
}

export function useProcessesQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(processesQueryOptions(auth.transport, projectId))
}

export function useCreateProcessMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateProcessRequest) => createProcess(transport, projectId, input),
    () => [surveyQueryKeys.processes(projectId)],
  )
}

export function useUpdateProcessMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { processId, input }: { processId: string; input: UpdateProcessRequest }) =>
      updateProcess(transport, processId, input),
    () => [surveyQueryKeys.processes(projectId)],
  )
}

export function useDeleteProcessMutation(projectId: string) {
  return useSurveyMutation(
    (transport, processId: string) => deleteProcess(transport, processId),
    () => [surveyQueryKeys.processes(projectId)],
  )
}

export function useCreateProcessStepMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { processId, input }: { processId: string; input: CreateProcessStepRequest }) =>
      createProcessStep(transport, processId, input),
    () => [surveyQueryKeys.processes(projectId)],
  )
}

export function useUpdateProcessStepMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { stepId, input }: { stepId: string; input: UpdateProcessStepRequest }) =>
      updateProcessStep(transport, stepId, input),
    () => [surveyQueryKeys.processes(projectId)],
  )
}

export function useDeleteProcessStepMutation(projectId: string) {
  return useSurveyMutation(
    (transport, stepId: string) => deleteProcessStep(transport, stepId),
    () => [surveyQueryKeys.processes(projectId)],
  )
}

export function useReorderProcessStepsMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { processId, side, ids }: { processId: string; side: 'asis' | 'tobe'; ids: string[] },
    ) => reorderProcessSteps(transport, processId, { side, ids }),
    () => [surveyQueryKeys.processes(projectId)],
  )
}

export function useUploadProcessSchemeMutation(projectId: string) {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      processId,
      side,
      file,
    }: {
      processId: string
      side: 'asis' | 'tobe'
      file: File
    }) => uploadProcessScheme(auth.transport, processId, side, file),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: surveyQueryKeys.processes(projectId) }),
  })
}

export function useDeleteProcessSchemeMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { processId, side }: { processId: string; side: 'asis' | 'tobe' }) =>
      deleteProcessScheme(transport, processId, side),
    () => [surveyQueryKeys.processes(projectId)],
  )
}

// ============================================================
// Аналитика: риски, GAP, требования
// ============================================================

export function risksQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.risks(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) => listRisks(transport, projectId, { signal }),
  })
}

export function useRisksQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(risksQueryOptions(auth.transport, projectId))
}

export function useCreateRiskMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateRiskRequest) => createRisk(transport, projectId, input),
    () => [surveyQueryKeys.risks(projectId)],
  )
}

export function useUpdateRiskMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { riskId, input }: { riskId: string; input: UpdateRiskRequest }) =>
      updateRisk(transport, riskId, input),
    () => [surveyQueryKeys.risks(projectId)],
  )
}

export function useDeleteRiskMutation(projectId: string) {
  return useSurveyMutation(
    (transport, riskId: string) => deleteRisk(transport, riskId),
    () => [surveyQueryKeys.risks(projectId)],
  )
}

export function gapsQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.gaps(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) => listGaps(transport, projectId, { signal }),
  })
}

export function useGapsQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(gapsQueryOptions(auth.transport, projectId))
}

export function useCreateGapMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateGapRequest) => createGap(transport, projectId, input),
    () => [surveyQueryKeys.gaps(projectId)],
  )
}

export function useUpdateGapMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { gapId, input }: { gapId: string; input: UpdateGapRequest }) =>
      updateGap(transport, gapId, input),
    () => [surveyQueryKeys.gaps(projectId)],
  )
}

export function useDeleteGapMutation(projectId: string) {
  return useSurveyMutation(
    (transport, gapId: string) => deleteGap(transport, gapId),
    () => [surveyQueryKeys.gaps(projectId)],
  )
}

export function requirementsQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.requirements(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      listRequirements(transport, projectId, { signal }),
  })
}

export function useRequirementsQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(requirementsQueryOptions(auth.transport, projectId))
}

export function useCreateRequirementMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateRequirementRequest) => createRequirement(transport, projectId, input),
    () => [surveyQueryKeys.requirements(projectId)],
  )
}

export function useUpdateRequirementMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { requirementId, input }: { requirementId: string; input: UpdateRequirementRequest }) =>
      updateRequirement(transport, requirementId, input),
    () => [surveyQueryKeys.requirements(projectId)],
  )
}

export function useDeleteRequirementMutation(projectId: string) {
  return useSurveyMutation(
    (transport, requirementId: string) => deleteRequirement(transport, requirementId),
    () => [surveyQueryKeys.requirements(projectId)],
  )
}

// ============================================================
// Аналитика: журнал решений, коммуникации, quick wins, базлайны
// ============================================================

export function useDecisionsQuery(projectId: string) {
  const auth = useAuth()
  return useQuery({
    queryKey: surveyQueryKeys.decisions(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) => listDecisions(auth.transport, projectId, { signal }),
  })
}

export function useCreateDecisionMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateDecisionRequest) => createDecision(transport, projectId, input),
    () => [surveyQueryKeys.decisions(projectId)],
  )
}

export function useUpdateDecisionMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { decisionId, input }: { decisionId: string; input: UpdateDecisionRequest }) =>
      updateDecision(transport, decisionId, input),
    () => [surveyQueryKeys.decisions(projectId)],
  )
}

export function useDeleteDecisionMutation(projectId: string) {
  return useSurveyMutation(
    (transport, decisionId: string) => deleteDecision(transport, decisionId),
    () => [surveyQueryKeys.decisions(projectId)],
  )
}

export function useCommunicationsQuery(projectId: string) {
  const auth = useAuth()
  return useQuery({
    queryKey: surveyQueryKeys.communications(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      listCommunications(auth.transport, projectId, { signal }),
  })
}

export function useCreateCommunicationMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateCommunicationRequest) => createCommunication(transport, projectId, input),
    () => [surveyQueryKeys.communications(projectId)],
  )
}

export function useUpdateCommunicationMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { communicationId, input }: { communicationId: string; input: UpdateCommunicationRequest },
    ) => updateCommunication(transport, communicationId, input),
    () => [surveyQueryKeys.communications(projectId)],
  )
}

export function useDeleteCommunicationMutation(projectId: string) {
  return useSurveyMutation(
    (transport, communicationId: string) => deleteCommunication(transport, communicationId),
    () => [surveyQueryKeys.communications(projectId)],
  )
}

export function useQuickWinsQuery(projectId: string) {
  const auth = useAuth()
  return useQuery({
    queryKey: surveyQueryKeys.quickWins(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) => listQuickWins(auth.transport, projectId, { signal }),
  })
}

export function useCreateQuickWinMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateQuickWinRequest) => createQuickWin(transport, projectId, input),
    () => [surveyQueryKeys.quickWins(projectId)],
  )
}

export function useUpdateQuickWinMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { quickWinId, input }: { quickWinId: string; input: UpdateQuickWinRequest }) =>
      updateQuickWin(transport, quickWinId, input),
    () => [surveyQueryKeys.quickWins(projectId)],
  )
}

export function useDeleteQuickWinMutation(projectId: string) {
  return useSurveyMutation(
    (transport, quickWinId: string) => deleteQuickWin(transport, quickWinId),
    () => [surveyQueryKeys.quickWins(projectId)],
  )
}

export function useBaselinesQuery(projectId: string) {
  const auth = useAuth()
  return useQuery({
    queryKey: surveyQueryKeys.baselines(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) => listBaselines(auth.transport, projectId, { signal }),
  })
}

export function useCreateBaselineMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateBaselineRequest) => createBaseline(transport, projectId, input),
    () => [surveyQueryKeys.baselines(projectId)],
  )
}

export function useUpdateBaselineMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { baselineId, input }: { baselineId: string; input: UpdateBaselineRequest }) =>
      updateBaseline(transport, baselineId, input),
    () => [surveyQueryKeys.baselines(projectId)],
  )
}

export function useDeleteBaselineMutation(projectId: string) {
  return useSurveyMutation(
    (transport, baselineId: string) => deleteBaseline(transport, baselineId),
    () => [surveyQueryKeys.baselines(projectId)],
  )
}

export function registriesQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.registries(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      listRegistries(transport, projectId, { signal }),
  })
}

export function useRegistriesQuery(projectId: string) {
  const auth = useAuth()
  return useQuery(registriesQueryOptions(auth.transport, projectId))
}

// ============================================================
// Свои реестры: конструктор полей/статусов, записи, bulk, импорт
// ============================================================

export function registryEntriesQueryOptions(
  transport: AuthenticatedTransport,
  registryId: string,
  query: RegistryEntriesQuery = {},
) {
  return queryOptions({
    queryKey: [...surveyQueryKeys.registryEntries(registryId), query] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      listRegistryEntries(transport, registryId, query, { signal }),
  })
}

export function useRegistryEntriesQuery(registryId: string, query: RegistryEntriesQuery = {}) {
  const auth = useAuth()
  return useQuery({
    ...registryEntriesQueryOptions(auth.transport, registryId, query),
    enabled: registryId.length > 0,
  })
}

export function useCreateRegistryMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateRegistryRequest) => createRegistry(transport, projectId, input),
    () => [surveyQueryKeys.registries(projectId)],
  )
}

export function useUpdateRegistryMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { registryId, input }: { registryId: string; input: UpdateRegistryRequest }) =>
      updateRegistry(transport, registryId, input),
    () => [surveyQueryKeys.registries(projectId)],
  )
}

export function useDeleteRegistryMutation(projectId: string) {
  return useSurveyMutation(
    (transport, registryId: string) => deleteRegistry(transport, registryId),
    () => [surveyQueryKeys.registries(projectId)],
  )
}

export function useCreateRegistryFieldMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { registryId, input }: { registryId: string; input: CreateRegistryFieldRequest }) =>
      createRegistryField(transport, registryId, input),
    () => [surveyQueryKeys.registries(projectId)],
  )
}

export function useUpdateRegistryFieldMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { fieldId, input }: { fieldId: string; input: UpdateRegistryFieldRequest }) =>
      updateRegistryField(transport, fieldId, input),
    () => [surveyQueryKeys.registries(projectId)],
  )
}

export function useDeleteRegistryFieldMutation(projectId: string) {
  return useSurveyMutation(
    (transport, fieldId: string) => deleteRegistryField(transport, fieldId),
    () => [surveyQueryKeys.registries(projectId)],
  )
}

export function useCreateRegistryStatusMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { registryId, input }: { registryId: string; input: CreateRegistryStatusRequest }) =>
      createRegistryStatus(transport, registryId, input),
    () => [surveyQueryKeys.registries(projectId)],
  )
}

export function useUpdateRegistryStatusMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { statusId, input }: { statusId: string; input: UpdateRegistryStatusRequest }) =>
      updateRegistryStatus(transport, statusId, input),
    () => [surveyQueryKeys.registries(projectId)],
  )
}

export function useDeleteRegistryStatusMutation(projectId: string) {
  return useSurveyMutation(
    (transport, statusId: string) => deleteRegistryStatus(transport, statusId),
    () => [surveyQueryKeys.registries(projectId)],
  )
}

export function useCreateRegistryEntryMutation(registryId: string) {
  return useSurveyMutation(
    (transport, input: CreateRegistryEntryRequest) =>
      createRegistryEntry(transport, registryId, input),
    () => [surveyQueryKeys.registry(registryId)],
  )
}

export function useUpdateRegistryEntryMutation(registryId: string) {
  return useSurveyMutation(
    (transport, { entryId, input }: { entryId: string; input: UpdateRegistryEntryRequest }) =>
      updateRegistryEntry(transport, entryId, input),
    () => [surveyQueryKeys.registry(registryId)],
  )
}

export function useDeleteRegistryEntryMutation(registryId: string) {
  return useSurveyMutation(
    (transport, entryId: string) => deleteRegistryEntry(transport, entryId),
    () => [surveyQueryKeys.registry(registryId)],
  )
}

export function useBulkStatusRegistryEntriesMutation(registryId: string) {
  return useSurveyMutation(
    (
      transport,
      input: { ids: string[]; statusId: string },
    ) => bulkStatusRegistryEntries(transport, registryId, input),
    () => [surveyQueryKeys.registry(registryId)],
  )
}

export function useBulkDeleteRegistryEntriesMutation(registryId: string) {
  return useSurveyMutation(
    (transport, ids: string[]) => bulkDeleteRegistryEntries(transport, registryId, { ids }),
    () => [surveyQueryKeys.registry(registryId)],
  )
}

export function useImportRegistryEntriesMutation(registryId: string) {
  return useSurveyMutation(
    (transport, input: RegistryImportRequest) => importRegistryEntries(transport, registryId, input),
    () => [surveyQueryKeys.registry(registryId)],
  )
}

// ============================================================
// Комментарии-треды
// ============================================================

export function useCommentsQuery(projectId: string, threadType: ThreadType, threadId: string) {
  const auth = useAuth()
  return useQuery({
    queryKey: surveyQueryKeys.comments(projectId, threadType, threadId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      listComments(auth.transport, projectId, { threadType, threadId }, { signal }),
    enabled: projectId.length > 0 && threadId.length > 0,
  })
}

export function useCreateCommentMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      input: { threadType: ThreadType; threadId: string; body: string; needsAnswer: boolean },
    ) => createComment(transport, projectId, input),
    ({ threadType, threadId }) => [
      surveyQueryKeys.comments(projectId, threadType, threadId),
      surveyQueryKeys.notifications(),
    ],
  )
}

// ============================================================
// Отчёт: разделы, автовставки, визы
// ============================================================

export function reportQueryOptions(transport: AuthenticatedTransport, projectId: string) {
  return queryOptions({
    queryKey: surveyQueryKeys.report(projectId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      getProjectReport(transport, projectId, { signal }),
  })
}

export function useReportQuery(projectId: string, enabled = true) {
  const auth = useAuth()
  return useQuery({
    ...reportQueryOptions(auth.transport, projectId),
    enabled: enabled && projectId.length > 0,
  })
}

export function useCreateReportSectionMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateReportSectionRequest) =>
      createReportSection(transport, projectId, input),
    () => [surveyQueryKeys.report(projectId)],
  )
}

export function useUpdateReportSectionMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { sectionId, input }: { sectionId: string; input: UpdateReportSectionRequest },
    ) => updateReportSection(transport, sectionId, input),
    () => [surveyQueryKeys.report(projectId)],
  )
}

/** Перестановка соседних разделов: свап sortOrder, как у этапов. */
export function useMoveReportSectionMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { sectionId, sortOrder }: { sectionId: string; sortOrder: number },
    ) => updateReportSection(transport, sectionId, { sortOrder }),
    () => [surveyQueryKeys.report(projectId)],
  )
}

export function useDeleteReportSectionMutation(projectId: string) {
  return useSurveyMutation(
    (transport, sectionId: string) => deleteReportSection(transport, sectionId),
    () => [surveyQueryKeys.report(projectId)],
  )
}

export function useApproveSectionMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { sectionId, input }: { sectionId: string; input: SectionApprovalRequest }) =>
      approveReportSection(transport, sectionId, input),
    () => [surveyQueryKeys.report(projectId)],
  )
}

export function useInsertReportFragmentMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: ReportInsertRequest) => insertReportFragment(transport, projectId, input),
    () => [surveyQueryKeys.report(projectId)],
  )
}

// ============================================================
// Центр уведомлений
// ============================================================

export function notificationsQueryOptions(transport: AuthenticatedTransport) {
  return queryOptions({
    queryKey: surveyQueryKeys.notifications(),
    queryFn: ({ signal }: { signal: AbortSignal }) => listNotifications(transport, { signal }),
    refetchInterval: 60_000,
  })
}

export function useNotificationsQuery(enabled = true) {
  const auth = useAuth()
  return useQuery({ ...notificationsQueryOptions(auth.transport), enabled })
}

export function useMarkThreadReadMutation() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MarkThreadReadRequest) => markThreadRead(auth.transport, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: surveyQueryKeys.notifications() }),
  })
}

// ============================================================
// Гайды: конструктор — CRUD, дублирование, перестановка
// ============================================================

export function useCreateGuideMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateGuideRequest) => createGuide(transport, projectId, input),
    () => [surveyQueryKeys.guides(projectId)],
  )
}

export function useUpdateGuideMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { guideId, input }: { guideId: string; input: UpdateGuideRequest }) =>
      updateGuide(transport, guideId, input),
    () => [surveyQueryKeys.guides(projectId)],
  )
}

export function useDeleteGuideMutation(projectId: string) {
  return useSurveyMutation(
    (transport, guideId: string) => deleteGuide(transport, guideId),
    () => [surveyQueryKeys.guides(projectId), surveyQueryKeys.interviews(projectId)],
  )
}

export function useDuplicateGuideMutation(projectId: string) {
  return useSurveyMutation(
    (transport, guideId: string) => duplicateGuide(transport, guideId),
    () => [surveyQueryKeys.guides(projectId)],
  )
}

export function useCreateGuideSectionMutation(projectId: string) {
  return useSurveyMutation(
    (transport, { guideId, input }: { guideId: string; input: CreateGuideSectionRequest }) =>
      createGuideSection(transport, guideId, input),
    () => [surveyQueryKeys.guides(projectId)],
  )
}

export function useUpdateGuideSectionMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { sectionId, input }: { sectionId: string; input: UpdateGuideSectionRequest },
    ) => updateGuideSection(transport, sectionId, input),
    () => [surveyQueryKeys.guides(projectId)],
  )
}

export function useDeleteGuideSectionMutation(projectId: string) {
  return useSurveyMutation(
    (transport, sectionId: string) => deleteGuideSection(transport, sectionId),
    () => [surveyQueryKeys.guides(projectId)],
  )
}

/** Перестановка соседних секций: сервер хранит целочисленный sortOrder, свапаем значения. */
export function useMoveGuideSectionMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      {
        sections,
        index,
        direction,
      }: { sections: GuideSectionDto[]; index: number; direction: -1 | 1 },
    ) => {
      const target = sections[index]
      const neighbor = sections[index + direction]
      if (!target || !neighbor) return Promise.resolve(null)
      return Promise.all([
        updateGuideSection(transport, target.id, { sortOrder: neighbor.sortOrder }),
        updateGuideSection(transport, neighbor.id, { sortOrder: target.sortOrder }),
      ])
    },
    () => [surveyQueryKeys.guides(projectId)],
  )
}

export function useCreateGuideQuestionMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { sectionId, input }: { sectionId: string; input: CreateGuideQuestionRequest },
    ) => createGuideQuestion(transport, sectionId, input),
    () => [surveyQueryKeys.guides(projectId)],
  )
}

export function useUpdateGuideQuestionMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { questionId, input }: { questionId: string; input: UpdateGuideQuestionRequest },
    ) => updateGuideQuestion(transport, questionId, input),
    () => [surveyQueryKeys.guides(projectId)],
  )
}

export function useDeleteGuideQuestionMutation(projectId: string) {
  return useSurveyMutation(
    (transport, questionId: string) => deleteGuideQuestion(transport, questionId),
    () => [surveyQueryKeys.guides(projectId)],
  )
}

/** Перестановка соседних вопросов внутри секции: свап sortOrder. */
export function useMoveGuideQuestionMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      {
        questions,
        index,
        direction,
      }: { questions: GuideQuestionDto[]; index: number; direction: -1 | 1 },
    ) => {
      const target = questions[index]
      const neighbor = questions[index + direction]
      if (!target || !neighbor) return Promise.resolve(null)
      return Promise.all([
        updateGuideQuestion(transport, target.id, { sortOrder: neighbor.sortOrder }),
        updateGuideQuestion(transport, neighbor.id, { sortOrder: target.sortOrder }),
      ])
    },
    () => [surveyQueryKeys.guides(projectId)],
  )
}

// ============================================================
// Участники проекта: добавление, роль, удаление
// ============================================================

export function useAddProjectMemberMutation(projectId: string) {
  return useSurveyMutation(
    (transport, input: CreateProjectMemberRequest) => addProjectMember(transport, projectId, input),
    () => [surveyQueryKeys.members(projectId), surveyQueryKeys.project(projectId)],
  )
}

export function useUpdateProjectMemberMutation(projectId: string) {
  return useSurveyMutation(
    (
      transport,
      { memberId, role }: { memberId: string; role: MemberRole },
    ) => updateProjectMemberRole(transport, projectId, memberId, role),
    () => [surveyQueryKeys.members(projectId), surveyQueryKeys.project(projectId)],
  )
}

export function useRemoveProjectMemberMutation(projectId: string) {
  return useSurveyMutation(
    (transport, memberId: string) => removeProjectMember(transport, projectId, memberId),
    () => [surveyQueryKeys.members(projectId), surveyQueryKeys.project(projectId)],
  )
}

// ============================================================
// Приглашения: список, создание, деактивация
// ============================================================

export function invitesQueryOptions(transport: AuthenticatedTransport) {
  return queryOptions({
    queryKey: surveyQueryKeys.invites(),
    queryFn: ({ signal }: { signal: AbortSignal }) => listInvites(transport, { signal }),
  })
}

export function useInvitesQuery(enabled = true) {
  const auth = useAuth()
  return useQuery({ ...invitesQueryOptions(auth.transport), enabled })
}

export function useCreateInviteMutation() {
  return useSurveyMutation(
    (transport, input: CreateInviteRequest) => createInvite(transport, input),
    () => [surveyQueryKeys.invites()],
  )
}

export function useDeactivateInviteMutation() {
  return useSurveyMutation(
    (transport, inviteId: string) => deactivateInvite(transport, inviteId),
    () => [surveyQueryKeys.invites()],
  )
}

// ============================================================
// Библиотека методик: шаблоны проектов
// ============================================================

export function projectTemplatesQueryOptions(transport: AuthenticatedTransport) {
  return queryOptions({
    queryKey: surveyQueryKeys.projectTemplates(),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      listProjectTemplates(transport, { signal }),
  })
}

export function useProjectTemplatesQuery(enabled = true) {
  const auth = useAuth()
  return useQuery({ ...projectTemplatesQueryOptions(auth.transport), enabled })
}

export function useCreateProjectFromTemplateMutation() {
  return useSurveyMutation(
    (transport, input: CreateProjectFromTemplateRequest) =>
      createProjectFromTemplate(transport, input),
    () => [surveyQueryKeys.projects()],
  )
}
