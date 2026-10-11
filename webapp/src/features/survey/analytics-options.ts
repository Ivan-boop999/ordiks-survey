import { useFindingsQuery, useDomainGroupsQuery } from './queries'
import { useSurveyProject } from './use-survey-project'

// ============================================================
// Общие опции для вкладок аналитики (домены и находки для селектов).
// Отдельный модуль — чтобы страницы оставались только с компонентами
// (fast-refresh) и без цикла импортов между вкладками.
// ============================================================

export type DomainOption = { id: string; name: string }
export type FindingOption = { id: string; title: string }

export function useAnalyticsOptions() {
  const { projectId } = useSurveyProject()
  const groupsQuery = useDomainGroupsQuery(projectId)
  const findingsQuery = useFindingsQuery(projectId)
  const domains: DomainOption[] = (groupsQuery.data?.items ?? []).flatMap((group) => group.domains)
  const findings: FindingOption[] = findingsQuery.data?.items ?? []
  return { domains, findings }
}

export function domainName(domains: readonly DomainOption[], domainId: string | null): string {
  return domains.find((domain) => domain.id === domainId)?.name ?? '—'
}
