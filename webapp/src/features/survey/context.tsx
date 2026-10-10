import type { UserDto } from '@ordiks-survey/contracts'
import { useMemo, type PropsWithChildren } from 'react'

import { useAuth } from '@/features/auth'
import {
  SurveyProjectContext,
  type SurveyProjectContextValue,
} from './survey-project-context'
import { viewRoleFor } from './model'
import { useProjectQuery, useProjectsQuery } from './queries'

export function SurveyProjectProvider({
  children,
  projectId,
}: PropsWithChildren<{ projectId: string }>) {
  const auth = useAuth()
  const projectsQuery = useProjectsQuery()
  const detailQuery = useProjectQuery(projectId)

  const value = useMemo<SurveyProjectContextValue>(() => {
    const summary =
      projectsQuery.data?.items.find((project) => project.id === projectId) ?? null
    const detail = detailQuery.data ?? null
    // Провайдер монтируется только внутри авторизованной оболочки (/survey/*), поэтому
    // пользователь здесь есть всегда; проверка — на уровне маршрута.
    const user = auth.user as UserDto
    const memberRole = detail?.members.find((member) => member.userId === user.id)?.role ?? null
    return {
      user,
      projectId,
      detail,
      isDetailLoading: detailQuery.isPending,
      summary,
      memberRole,
      viewRole: viewRoleFor(user.orgRole, memberRole),
      canEdit: summary?.access.edit ?? detail?.access.edit ?? false,
    }
  }, [auth.user, detailQuery.data, detailQuery.isPending, projectId, projectsQuery.data])

  return <SurveyProjectContext.Provider value={value}>{children}</SurveyProjectContext.Provider>
}
