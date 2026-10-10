import {
  AlertCircleIcon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Grid02Icon,
  InboxIcon,
  Loading03Icon,
  MilestoneIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import type { ChipColor, DataRequestDto } from '@ordiks-survey/contracts'
import { useMemo } from 'react'

import { PageContainer } from '@/components/PageLayout'
import { KpiCard, ProgressBar, SectionCard, StatusChip, UserAvatar } from '@/components/survey'
import { Typography } from '@/components/typography'
import { Button } from '@/components/ui/button'
import { useSurveyProject } from '../use-survey-project'
import {
  coverageOf,
  dashboardKpis,
  isOpenFinding,
  topFindingsOf,
  upcomingInterviewsOf,
  waitingRequestsFor,
} from '../dashboard-model'
import {
  formatDateRu,
  findingStatusMeta,
  INTERVIEW_STATUS_META,
  priorityMeta,
  pluralRu,
  REQUEST_STATUS_META,
  sectionPath,
  STAGE_STATUS_META,
  type SurveySection,
} from '../model'
import {
  useDataRequestsQuery,
  useDomainGroupsQuery,
  useFindingsQuery,
  useInterviewsQuery,
  useStagesQuery,
  useTasksQuery,
  useUpdateRequestStatusMutation,
} from '../queries'

const KPI_COLORS: Record<string, ChipColor> = {
  coverage: 'blue',
  interview: 'purple',
  findings: 'amber',
  requests: 'red',
  milestone: 'purple',
}

const KPI_ICONS: Record<string, React.ReactNode> = {
  coverage: <HugeiconsIcon icon={Grid02Icon} strokeWidth={2} />,
  interview: <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} />,
  findings: <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />,
  requests: <HugeiconsIcon icon={InboxIcon} strokeWidth={2} />,
  milestone: <HugeiconsIcon icon={MilestoneIcon} strokeWidth={2} />,
}

/** Ролевой дашборд проекта (по прототипу): KPI, «Ждём от заказчика/вас», этапы, домены. */
export function DashboardPage() {
  const { projectId, viewRole, user, detail } = useSurveyProject()
  const isTeam = viewRole === 'team'
  const isObserver = viewRole === 'observer'
  const domainsQuery = useDomainGroupsQuery(projectId)
  const stagesQuery = useStagesQuery(projectId)
  const tasksQuery = useTasksQuery(projectId)
  const requestsQuery = useDataRequestsQuery(projectId)
  const findingsQuery = useFindingsQuery(projectId)
  const interviewsQuery = useInterviewsQuery(projectId)

  const groups = useMemo(() => domainsQuery.data?.items ?? [], [domainsQuery.data])
  const coverage = useMemo(() => coverageOf(groups), [groups])
  const stages = useMemo(
    () =>
      (stagesQuery.data?.items ?? [])
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [stagesQuery.data],
  )
  const tasks = tasksQuery.data?.items ?? []
  const requests = useMemo(() => requestsQuery.data?.items ?? [], [requestsQuery.data])
  const findingStatuses = useMemo(
    () => detail?.settings.findingStatuses ?? [],
    [detail?.settings.findingStatuses],
  )
  const findings = useMemo(() => findingsQuery.data?.items ?? [], [findingsQuery.data])
  const openFindings = useMemo(
    () => findings.filter((finding) => isOpenFinding(finding, findingStatuses)),
    [findings, findingStatuses],
  )
  const topFindings = useMemo(() => topFindingsOf(openFindings), [openFindings])
  const waiting = useMemo(
    () => waitingRequestsFor(viewRole, user.id, requests),
    [requests, user.id, viewRole],
  )
  const kpis = useMemo(
    () =>
      dashboardKpis({
        viewRole,
        coverage,
        findings,
        findingStatuses,
        requests,
        userId: user.id,
        stages,
        interviews: interviewsQuery.data?.items ?? [],
      }),
    [coverage, findingStatuses, findings, interviewsQuery.data, requests, stages, user.id, viewRole],
  )
  const upcomingInterviews = useMemo(
    () => upcomingInterviewsOf(interviewsQuery.data?.items ?? []),
    [interviewsQuery.data],
  )
  const domainsById = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of groups) {
      for (const domain of group.domains) map.set(domain.id, domain.name)
    }
    return map
  }, [groups])

  const hour = new Date().getHours()
  const greeting =
    hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'

  const sectionHref = (section: SurveySection) => sectionPath(projectId, section)

  return (
    <PageContainer>
      {/* hero-полоса дашборда: мягкий градиентный акцент бренда (как в прототипе) */}
      <section
        className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-blue-50 via-violet-50/50 to-card p-5 dark:from-blue-950/40 dark:via-violet-950/20"
        data-testid="dashboard-hero"
      >
        <Typography as="p" tone="muted" variant="control">
          {greeting}
        </Typography>
        <Typography as="h1" className="mt-0.5" data-testid="dashboard-project-name" truncate variant="h4">
          {detail?.name ?? '…'}
        </Typography>
        <Typography as="p" className="mt-1" tone="muted" variant="bodySm">
          {formatDateRu(new Date())} · этапов: {stages.length} · доменов: {coverage.allDomains}
          {detail ? ` · команда: ${detail.members.length}` : ''}
        </Typography>
      </section>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" data-testid="dashboard-kpis">
        {kpis.map((kpi) => (
          <KpiCard
            color={KPI_COLORS[kpi.key]}
            hint={kpi.hint}
            icon={KPI_ICONS[kpi.key]}
            key={kpi.key}
            label={kpi.label}
            tone={kpi.tone ?? 'default'}
            value={kpi.value}
          />
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard
          title={isTeam || isObserver ? 'Ждём от заказчика' : 'Ждём от вас'}
          actions={
            <Button asChild size="xs" variant="ghost">
              <Link to={sectionHref('requests')}>
                Все запросы
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Link>
            </Button>
          }
        >
          {waiting.length === 0 ? (
            <Typography as="p" tone="muted" variant="bodySm">
              Открытых запросов нет — всё получено.
            </Typography>
          ) : (
            <div className="grid gap-2" data-testid="dashboard-waiting-list">
              {waiting.slice(0, 6).map((request) => (
                <WaitingRequestRow key={request.id} projectId={projectId} request={request} />
              ))}
              {waiting.length > 6 ? (
                <Typography as="p" tone="muted" variant="caption">
                  …и ещё {waiting.length - 6}
                </Typography>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Этапы"
          actions={
            <Button asChild size="xs" variant="ghost">
              <Link to={sectionHref('stages')}>
                К этапам
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Link>
            </Button>
          }
        >
          {stages.length === 0 ? (
            <Typography as="p" tone="muted" variant="bodySm">
              Этапы не заданы.
            </Typography>
          ) : (
            <div className="grid">
              {stages.map((stage) => {
                const stageTasks = tasks.filter((task) => task.stageId === stage.id)
                const done = stageTasks.filter((task) => task.status === 'done').length
                const meta = STAGE_STATUS_META[stage.status]
                return (
                  <div className="border-b py-2 last:border-b-0" key={stage.id}>
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Typography as="span" truncate variant="control">
                          {stage.name}
                        </Typography>
                        {stage.milestone ? <StatusChip color="purple">веха</StatusChip> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusChip color={meta.color}>{meta.label}</StatusChip>
                        <Typography as="span" className="whitespace-nowrap" tone="muted" variant="caption">
                          {formatDateRu(stage.startAt, true)} — {formatDateRu(stage.endAt, true)}
                        </Typography>
                      </div>
                    </div>
                    <ProgressBar
                      done={done}
                      max={stageTasks.length}
                      tone={stageTasks.length > 0 && done === stageTasks.length ? 'green' : 'primary'}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {isTeam ? (
        <SectionCard
          title="Покрытие доменов по группам"
          actions={
            <Button asChild size="xs" variant="ghost">
              <Link to={sectionHref('domains')}>
                К доменам
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Link>
            </Button>
          }
        >
          {groups.length === 0 ? (
            <Typography as="p" tone="muted" variant="bodySm">
              Домены пока не заданы.
            </Typography>
          ) : (
            <div className="grid gap-2" data-testid="dashboard-domain-coverage">
              {groups.map((group) => {
                const { done, total } = coverageOf([group])
                return (
                  <div className="flex items-center gap-3" key={group.id}>
                    <Typography as="span" className="w-40 shrink-0" title={group.name} truncate variant="bodySm">
                      {group.name}
                    </Typography>
                    <ProgressBar className="flex-1" done={done} max={total} />
                    <Typography as="span" className="w-10 shrink-0 text-right tabular-nums" variant="bodySmMedium">
                      {total > 0 ? Math.round((done / total) * 100) : 0}%
                    </Typography>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard title="Ближайшие интервью">
          {upcomingInterviews.length === 0 ? (
            <Typography as="p" tone="muted" variant="bodySm">
              Интервью пока не запланированы.
            </Typography>
          ) : (
            <div className="grid gap-2" data-testid="dashboard-interviews">
              {upcomingInterviews.map((interview) => {
                const meta = INTERVIEW_STATUS_META[interview.status]
                return (
                  <div
                    className="flex items-center gap-3 rounded-lg border px-3 py-2"
                    key={interview.id}
                  >
                    <div className="min-w-0 flex-1">
                      <Typography as="p" truncate variant="bodySm">
                        <Typography as="span" variant="bodySmMedium">
                          {interview.respondent}
                        </Typography>
                        {interview.respondentRole ? ` — ${interview.respondentRole}` : ''}
                      </Typography>
                      <Typography as="p" tone="muted" truncate variant="caption">
                        {formatDateRu(interview.scheduledAt, true)} ·{' '}
                        {interview.domainId ? (domainsById.get(interview.domainId) ?? '—') : '—'}
                      </Typography>
                    </div>
                    <StatusChip color={meta.color}>{meta.label}</StatusChip>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Актуальные находки"
          actions={
            <Button asChild size="xs" variant="ghost">
              <Link to={sectionHref('findings')}>
                Все находки
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Link>
            </Button>
          }
        >
          {topFindings.length === 0 ? (
            <Typography as="p" tone="muted" variant="bodySm">
              Открытых находок нет.
            </Typography>
          ) : (
            <div className="grid gap-2" data-testid="dashboard-findings">
              {topFindings.map((finding) => {
                const priority = priorityMeta(finding.priority)
                const status = findingStatusMeta(finding.status, findingStatuses)
                return (
                  <div
                    className="flex items-center gap-3 rounded-lg border px-3 py-2"
                    key={finding.id}
                  >
                    <div className="min-w-0 flex-1">
                      <Typography as="p" truncate variant="bodySm">
                        <StatusChip className="mr-1.5" color={priority.color}>
                          {priority.label}
                        </StatusChip>
                        <Typography as="span" variant="bodySmMedium">
                          {finding.title}
                        </Typography>
                      </Typography>
                      <Typography as="p" tone="muted" truncate variant="caption">
                        {finding.category}
                      </Typography>
                    </div>
                    <StatusChip color={status.color}>{status.label}</StatusChip>
                  </div>
                )
              })}
              {openFindings.length > 5 ? (
                <Typography as="p" tone="muted" variant="caption">
                  …и ещё {openFindings.length - 5}{' '}
                  {pluralRu(openFindings.length - 5, 'находка', 'находки', 'находок')}
                </Typography>
              ) : null}
            </div>
          )}
        </SectionCard>
      </div>
    </PageContainer>
  )
}

/** Строка запроса в блоке «Ждём»: у клиента — кнопки «Взять в работу» и «Получено». */
function WaitingRequestRow({
  projectId,
  request,
}: {
  projectId: string
  request: DataRequestDto
}) {
  const { viewRole, detail } = useSurveyProject()
  const updateStatus = useUpdateRequestStatusMutation(projectId)
  const assignee = detail?.members.find((member) => member.userId === request.assigneeId)
  const meta = REQUEST_STATUS_META[request.status]
  const canAct = viewRole === 'client' && request.status !== 'received'

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <div className="min-w-0 flex-1">
        <Typography as="p" truncate variant="control">
          {request.what}
        </Typography>
        <Typography as="p" tone="muted" truncate variant="caption">
          {assignee ? `${assignee.displayName ?? assignee.email} · ` : ''}
          {request.deadline
            ? `до ${formatDateRu(request.deadline)}${request.overdue ? ' (просрочен)' : ''}`
            : 'без срока'}
        </Typography>
      </div>
      {canAct ? (
        <div className="flex items-center gap-1.5">
          {request.status === 'requested' ? (
            <Button
              data-testid={`request-start-${request.id}`}
              disabled={updateStatus.isPending}
              onClick={() => updateStatus.mutate({ requestId: request.id, status: 'in_progress' })}
              size="xs"
              variant="outline"
            >
              <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} />
              Взять в работу
            </Button>
          ) : null}
          <Button
            data-testid={`request-received-${request.id}`}
            disabled={updateStatus.isPending}
            onClick={() => updateStatus.mutate({ requestId: request.id, status: 'received' })}
            size="xs"
          >
            <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
            Получено
          </Button>
        </div>
      ) : (
        <StatusChip color={request.overdue ? 'red' : meta.color}>
          {request.overdue ? 'Просрочен' : meta.label}
        </StatusChip>
      )}
      {assignee ? (
        <UserAvatar
          email={assignee.email}
          name={assignee.displayName}
          title={assignee.displayName ?? assignee.email}
        />
      ) : null}
    </div>
  )
}
