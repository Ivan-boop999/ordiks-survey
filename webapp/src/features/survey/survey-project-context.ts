import type { MemberRole, ProjectDetail, ProjectSummary, UserDto } from '@ordiks-survey/contracts'
import { createContext } from 'react'

import type { SurveyViewRole } from './model'

/**
 * Контекст активного проекта: паспорт (участники, справочники, access) + вычисленная роль
 * просмотра. Сервер остаётся источником прав (`access.edit`); модель ролей здесь — только
 * для меню и кнопок.
 */
export type SurveyProjectContextValue = {
  user: UserDto
  projectId: string
  /** Паспорт проекта; грузится, но не блокирует разделы, которым нужна только сводка. */
  detail: ProjectDetail | null
  isDetailLoading: boolean
  /** Сводка из списка проектов (access!) либо деградирует до паспорта. */
  summary: ProjectSummary | null
  memberRole: MemberRole | null
  viewRole: SurveyViewRole
  /** Серверные права: можно ли создавать/менять сущности проекта. */
  canEdit: boolean
}

export const SurveyProjectContext = createContext<SurveyProjectContextValue | null>(null)
