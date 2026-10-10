import type {
  DataRequestDto,
  DomainGroupDto,
  FindingDto,
  FindingStatusItem,
  InterviewDto,
  StageDto,
  TaskStatus,
} from '@ordiks-survey/contracts'

import {
  daysUntil,
  daysUntilLabel,
  PRIORITY_RANK,
  type SurveyViewRole,
} from './model'

// ============================================================
// Агрегации дашборда: чистые функции — и экран, и тесты считают одинаково.
// ============================================================

export type Coverage = {
  done: number
  total: number
  closedDomains: number
  allDomains: number
  percent: number
}

export function coverageOf(groups: ReadonlyArray<DomainGroupDto>): Coverage {
  let done = 0
  let total = 0
  let closedDomains = 0
  let allDomains = 0
  for (const group of groups) {
    for (const domain of group.domains) {
      allDomains += 1
      if (domain.status === 'closed') closedDomains += 1
      for (const item of domain.checklist) {
        total += 1
        if (item.done) done += 1
      }
    }
  }
  return { done, total, closedDomains, allDomains, percent: total > 0 ? Math.round((done / total) * 100) : 0 }
}

/** Прогресс группы доменов (для полосы покрытия). */
export function groupCoverage(group: DomainGroupDto): { done: number; total: number } {
  return coverageOf([group])
}

/** Открытые запросы для роли: команда/наблюдатель видят все, клиент — назначенные ему. */
export function waitingRequestsFor(
  viewRole: SurveyViewRole,
  userId: string,
  requests: ReadonlyArray<DataRequestDto>,
): DataRequestDto[] {
  const relevant =
    viewRole === 'team' || viewRole === 'observer'
      ? requests
      : requests.filter((request) => request.assigneeId === userId)
  const open = relevant.filter((request) => request.status !== 'received')
  const overdue = open.filter((request) => request.overdue)
  const onTime = open.filter((request) => !request.overdue)
  return [...overdue, ...onTime]
}

/** Открытая находка — та, чей статус не «закрыт» по справочнику проекта. */
export function isOpenFinding(finding: FindingDto, statuses: ReadonlyArray<FindingStatusItem>) {
  return !statuses.some(
    (status) =>
      (status.id === finding.status || status.name === finding.status) &&
      (status.id === 'closed' || status.name.toLowerCase() === 'закрыта'),
  )
}

/** Ближайшая веха/этап с датой окончания (первый будущий, иначе последний прошедший). */
export function milestoneOf(stages: ReadonlyArray<StageDto>): StageDto | null {
  const withEnd = stages.filter((stage) => stage.endAt !== null)
  const future = withEnd
    .filter((stage) => (daysUntil(stage.endAt) ?? -1) >= 0)
    .sort((left, right) => (left.endAt ?? '').localeCompare(right.endAt ?? ''))
  return future[0] ?? withEnd[withEnd.length - 1] ?? null
}

/** Топ открытых находок по приоритету (Критично → Низкий, неизвестные — в конец). */
export function topFindingsOf(findings: ReadonlyArray<FindingDto>, limit = 5) {
  return findings
    .slice()
    .sort(
      (left, right) => (PRIORITY_RANK[left.priority] ?? 9) - (PRIORITY_RANK[right.priority] ?? 9),
    )
    .slice(0, limit)
}

/** Ближайшие запланированные интервью по времени. */
export function upcomingInterviewsOf(interviews: ReadonlyArray<InterviewDto>, limit = 4) {
  return interviews
    .filter((interview) => interview.status === 'planned')
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
    .slice(0, limit)
}

export type DashboardKpi = {
  key: 'coverage' | 'interview' | 'findings' | 'requests' | 'milestone'
  label: string
  value: string
  hint: string
  tone?: 'warn' | 'danger'
}

export type DashboardKpiInput = {
  viewRole: SurveyViewRole
  coverage: Coverage
  findings: ReadonlyArray<FindingDto>
  findingStatuses: ReadonlyArray<FindingStatusItem>
  requests: ReadonlyArray<DataRequestDto>
  userId: string
  stages: ReadonlyArray<StageDto>
  interviews: ReadonlyArray<InterviewDto>
}

/**
 * KPI-карточки дашборда по ролям: командный KPI «Покрытие доменов» заказчику заменяется
 * ближайшим интервью (как ролевой дашборд прототипа — I-31).
 */
export function dashboardKpis(input: DashboardKpiInput): DashboardKpi[] {
  const { viewRole, coverage } = input
  const openRequests = waitingRequestsFor(viewRole, input.userId, input.requests).filter(
    (request) => request.status !== 'received',
  )
  const overdueRequests = openRequests.filter((request) => request.overdue)
  const openFindings = input.findings.filter((finding) =>
    isOpenFinding(finding, input.findingStatuses),
  )
  const milestone = milestoneOf(input.stages)
  const upcoming = upcomingInterviewsOf(input.interviews)

  const firstCard: DashboardKpi =
    viewRole === 'team'
      ? {
          key: 'coverage',
          label: 'Покрытие доменов',
          value: `${coverage.percent}%`,
          hint: `${coverage.done} из ${coverage.total} пунктов · закрыто доменов: ${coverage.closedDomains}/${coverage.allDomains}`,
        }
      : upcoming[0]
        ? {
            key: 'interview',
            label: 'Ближайшее интервью',
            value: daysUntilLabel(upcoming[0].scheduledAt),
            hint: upcoming[0].respondent,
          }
        : {
            key: 'interview',
            label: 'Ближайшее интервью',
            value: '—',
            hint: 'Интервью не запланированы',
          }

  return [
    firstCard,
    {
      key: 'findings',
      label: 'Открытые находки',
      value: String(openFindings.length),
      hint: `всего зарегистрировано: ${input.findings.length}`,
      tone: openFindings.length > 0 ? 'warn' : undefined,
    },
    {
      key: 'requests',
      label:
        viewRole === 'client' ? 'Запросы к вам' : 'Запросы к заказчику',
      value: String(overdueRequests.length),
      hint: `просрочено · открыто: ${openRequests.length}`,
      tone: overdueRequests.length > 0 ? 'danger' : undefined,
    },
    {
      key: 'milestone',
      label: milestone ? `До вехи: ${milestone.name}` : 'Ключевая веха',
      value: milestone ? daysUntilLabel(milestone.endAt) : '—',
      hint: milestone?.endAt
        ? new Date(milestone.endAt).toLocaleDateString('ru-RU')
        : 'веха не задана',
      tone:
        milestone?.endAt && (daysUntil(milestone.endAt) ?? 0) < 0 ? 'danger' : undefined,
    },
  ]
}

// ============================================================
// Канбан плана: раскладка по колонкам и перемещение статуса
// ============================================================

const KANBAN_ORDER: readonly TaskStatus[] = ['todo', 'doing', 'done', 'cancelled']

/** Карточки по колонкам канбана в фиксированном порядке статусов. */
export function partitionByStatus<T extends { status: TaskStatus }>(tasks: ReadonlyArray<T>) {
  const columns = KANBAN_ORDER.map((status) => ({ status, tasks: [] as T[] }))
  const byStatus = new Map(columns.map((column) => [column.status, column]))
  for (const task of tasks) {
    byStatus.get(task.status)?.tasks.push(task)
  }
  return columns
}

/** Статус после сдвига на колонку (−1 влево, +1 вправо); за краем — null (кнопка выключена). */
export function moveTaskStatus(
  status: TaskStatus,
  direction: -1 | 1,
): TaskStatus | null {
  const index = KANBAN_ORDER.indexOf(status)
  const next = KANBAN_ORDER[index + direction]
  return next ?? null
}

/** Оптимистичное переключение пункта чек-листа (для мгновенного отклика до ответа API). */
export function toggleChecklistDone<T extends { id: string; done: boolean }>(
  items: ReadonlyArray<T>,
  itemId: string,
): Array<T> {
  return items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item))
}
