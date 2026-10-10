import { useContext } from 'react'

import { SurveyProjectContext, type SurveyProjectContextValue } from './survey-project-context'

/** Доступ к контексту активного проекта (паспорт, роль просмотра, права). */
export function useSurveyProject(): SurveyProjectContextValue {
  const value = useContext(SurveyProjectContext)
  if (!value) {
    throw new Error('useSurveyProject must be used within SurveyProjectProvider')
  }
  return value
}
