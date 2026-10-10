import { useLocation, useParams, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { SessionErrorSection, SessionLoadingSection } from '@/components/WebRouteSections'
import { useAuth } from '@/features/auth'
import {
  defaultProjectId,
  isSectionAllowed,
  isSurveySection,
  sectionPath,
  SURVEY_LAST_PROJECT_KEY,
  viewRoleFor,
  type SurveySection,
} from './model'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { FactsPage } from './pages/FactsPage'
import { FindingsPage } from './pages/FindingsPage'
import { InterviewsPage } from './pages/InterviewsPage'
import { ProcessesPage } from './pages/ProcessesPage'
import { ReportPage } from './pages/ReportPage'
import { RequestsPage } from './pages/RequestsPage'
import { DashboardPage } from './pages/DashboardPage'
import { DomainsPage } from './pages/DomainsPage'
import { PassportPage } from './pages/PassportPage'
import { PlanPage } from './pages/PlanPage'
import { StagesPage } from './pages/StagesPage'
import { useProjectsQuery, useProjectQuery } from './queries'
import { SurveyShell } from './shell/SurveyShell'
import { SurveyProjectProvider } from './context'
import { useSurveyProject } from './use-survey-project'

function readLastProjectId(): string | null {
  try {
    return window.localStorage.getItem(SURVEY_LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

function persistLastProjectId(projectId: string) {
  try {
    window.localStorage.setItem(SURVEY_LAST_PROJECT_KEY, projectId)
  } catch {
    // Приватный режим браузера: переключатель просто не запомнится.
  }
}

/**
 * Оболочка приложения обследования: общий сторож сессии (любая роль — доступ к конкретному
 * проекту решает сервер через `access`), сайдбар с разделами и мобильная навигация.
 */
export function SurveyWorkspaceLayout() {
  const auth = useAuth()
  const location = useLocation()
  const params = useParams({ strict: false }) as { projectId?: string; section?: string }
  const projectId = params.projectId ?? null
  const section = isSurveySection(params.section ?? '') ? (params.section as SurveySection) : null
  const projectsQuery = useProjectsQuery()
  const detailQuery = useProjectQuery(projectId ?? '', projectId !== null)
  const user = auth.user

  useEffect(() => {
    if (projectId) persistLastProjectId(projectId)
  }, [projectId])

  if (auth.isBootstrapping) return <SessionLoadingSection />
  if (auth.sessionError && !auth.user) {
    return <SessionErrorSection retry={auth.retrySession} />
  }
  if (!user) {
    const returnTo = `${location.pathname}${location.searchStr}`
    return <HrefRedirect href={`/login?returnTo=${encodeURIComponent(returnTo)}`} />
  }

  const memberRole =
    projectId === null
      ? null
      : (detailQuery.data?.members.find((member) => member.userId === user.id)?.role ?? null)
  const viewRole = viewRoleFor(user.orgRole, memberRole)

  const projects = (projectsQuery.data?.items ?? []).map((project) => ({
    id: project.id,
    name: project.name,
  }))
  const projectLabel = projects.find((project) => project.id === projectId)?.name ?? ''

  return (
    <SurveyProjectGate projectId={projectId}>
      <SurveyShell
        onLogout={auth.logout}
        projectId={projectId}
        projectLabel={projectLabel}
        projects={projects}
        section={section}
        user={user}
        viewRole={viewRole}
      />
    </SurveyProjectGate>
  )
}

/** Провайдер активного проекта; на /survey/projects его нет. */
function SurveyProjectGate({
  children,
  projectId,
}: {
  children: React.ReactNode
  projectId: string | null
}) {
  if (!projectId) return <>{children}</>
  return <SurveyProjectProvider projectId={projectId}>{children}</SurveyProjectProvider>
}

/** /survey: перенаправляем на дашборд проекта по умолчанию либо на список проектов. */
export function SurveyIndexPage() {
  const auth = useAuth()
  const projectsQuery = useProjectsQuery()

  if (auth.isBootstrapping || projectsQuery.isPending) return <SessionLoadingSection />
  if (!auth.user) return <HrefRedirect href="/login" />

  const projects = projectsQuery.data?.items ?? []
  const target = defaultProjectId(projects, readLastProjectId())
  return <HrefRedirect href={target ? sectionPath(target, 'dashboard') : '/survey/projects'} />
}

/** /survey/p/$projectId: перенаправляем на дашборд. */
export function SurveyProjectIndexPage() {
  const { projectId } = useParams({ strict: false }) as { projectId?: string }
  return <HrefRedirect href={projectId ? sectionPath(projectId, 'dashboard') : '/survey/projects'} />
}

/** /survey/p/$projectId/$section: сам раздел. */
export function SurveySectionPage() {
  const { section } = useParams({ strict: false }) as { section?: string }
  const { projectId, viewRole } = useSurveyProject()

  if (!section || !isSurveySection(section)) {
    return <HrefRedirect href={sectionPath(projectId, 'dashboard')} />
  }
  if (!isSectionAllowed(viewRole, section)) {
    return <HrefRedirect href={sectionPath(projectId, 'dashboard')} />
  }
  switch (section) {
    case 'dashboard':
      return <DashboardPage />
    case 'passport':
      return <PassportPage />
    case 'stages':
      return <StagesPage />
    case 'plan':
      return <PlanPage />
    case 'domains':
      return <DomainsPage />
    case 'interviews':
      return <InterviewsPage />
    case 'guides':
    case 'facts':
      return <FactsPage />
    case 'requests':
      return <RequestsPage />
    case 'findings':
      return <FindingsPage />
    case 'processes':
      return <ProcessesPage />
    case 'analytics':
      return <AnalyticsPage />
    case 'report':
      return <ReportPage />
    case 'settings':
      return <ComingSoonPage section={section} />
  }
}

function HrefRedirect({ href }: { href: string }) {
  const router = useRouter()
  useEffect(() => {
    router.history.replace(href)
  }, [href, router])
  return null
}
