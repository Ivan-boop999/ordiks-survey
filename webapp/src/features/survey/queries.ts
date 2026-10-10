import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type {
  CreateChecklistItemRequest,
  CreateDataRequestRequest,
  CreateDomainGroupRequest,
  CreateDomainRequest,
  CreateProjectRequest,
  CreateStageRequest,
  CreateTaskRequest,
  ProjectSummary,
  RequestStatus,
  StageDto,
  TaskStatus,
  UpdateChecklistItemRequest,
  UpdateDataRequestRequest,
  UpdateDomainGroupRequest,
  UpdateDomainRequest,
  UpdateProjectRequest,
  UpdateStageRequest,
  UpdateTaskRequest,
} from '@ordiks-survey/contracts'

import { useAuth } from '@/features/auth'
import type { AuthenticatedTransport } from '@/platform/api'
import {
  archiveProject,
  createChecklistItem,
  createDataRequest,
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
  getProject,
  listDomainGroups,
  listDataRequests,
  listFindings,
  listInterviews,
  listProjectMembers,
  listProjects,
  listStages,
  listTasks,
  updateChecklistItem,
  updateDataRequest,
  updateDataRequestStatus,
  updateDomain,
  updateDomainGroup,
  updateProject,
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
  return useSurveyMutation(
    (
      transport,
      { stages, index, direction }: { stages: StageDto[]; index: number; direction: -1 | 1 },
    ) => {
      const target = stages[index]
      const neighbor = stages[index + direction]
      if (!target || !neighbor) return Promise.resolve(null)
      return Promise.all([
        updateStage(transport, target.id, { sortOrder: neighbor.sortOrder }),
        updateStage(transport, neighbor.id, { sortOrder: target.sortOrder }),
      ])
    },
    () => [surveyQueryKeys.stages(projectId)],
  )
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
  return useSurveyMutation(
    (transport, { taskId, status }: { taskId: string; status: TaskStatus }) =>
      updateTask(transport, taskId, { status }),
    () => [surveyQueryKeys.tasks(projectId)],
  )
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
