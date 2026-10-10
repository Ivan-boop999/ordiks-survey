import type {
  FactsQuery,
  FactUploadTicket,
  FindingsQuery,
  GuideQuestionType,
  InterviewsQuery,
  ProjectSettings,
  RequestStatus,
} from '@ordiks-survey/contracts'

import type { PrivateStorage } from '../../../storage/port'

/**
 * What the survey use cases need from the outside world.
 *
 * `PrivateStorage` is imported rather than re-declared (same reasoning as the uploads module):
 * it is already a provider-neutral port owned by `backend/src/storage`.
 */
export type { PrivateStorage }

export type Clock = {
  now(): Date
}

// ============================================================
// Строки
// ============================================================

export type FactRow = {
  id: string
  projectId: string
  domainId: string | null
  authorId: string
  kind: string
  typeKey: string
  title: string
  description: string
  shop: string
  factDate: Date
  objectKey: string | null
  fileName: string | null
  createdAt: Date
}

export type FactWithFindingsRow = FactRow & {
  findings: Array<{ id: string; title: string; status: string }>
}

export type GuideSectionRow = {
  id: string
  guideId: string
  title: string
  sortOrder: number
}

export type GuideQuestionRow = {
  id: string
  sectionId: string
  type: string
  text: string
  options: string[]
  showIfQuestionId: string | null
  showIfValue: string | null
  sortOrder: number
}

export type GuideRow = {
  id: string
  projectId: string
  name: string
  createdAt: Date
}

export type GuideTreeRow = GuideRow & {
  sections: Array<GuideSectionRow & { questions: GuideQuestionRow[] }>
}

export type CreateGuideWrite = {
  projectId: string
  name: string
  sections: Array<{
    title: string
    sortOrder: number
    questions: Array<{
      /// Клиентский id вопроса из запроса (для перевязки showIf); может отсутствовать.
      clientRefId: string | null
      type: GuideQuestionType
      text: string
      options: string[]
      /// Клиентский id вопроса-источника условия; репозиторий заменит на новый id.
      showIfClientRefId: string | null
      showIfValue: string | null
      sortOrder: number
    }>
  }>
}

export type InterviewRow = {
  id: string
  projectId: string
  domainId: string | null
  guideId: string | null
  scheduledAt: Date
  respondent: string
  respondentRole: string
  status: 'planned' | 'done' | 'formatted'
  notes: string
}

export type InterviewAnswerRow = {
  questionId: string
  value: unknown
}

export type InterviewDetailRow = InterviewRow & {
  answers: InterviewAnswerRow[]
}

export type DataRequestRow = {
  id: string
  projectId: string
  domainId: string | null
  assigneeId: string | null
  what: string
  why: string
  deadline: Date | null
  status: RequestStatus
  createdAt: Date
  updatedAt: Date
  receivedAt: Date | null
}

export type FindingRow = {
  id: string
  projectId: string
  domainId: string | null
  factId: string | null
  ownerId: string | null
  title: string
  description: string
  category: string
  priority: string
  status: string
  createdAt: Date
  updatedAt: Date
}

// ============================================================
// Репозиторий
// ============================================================

/**
 * Данные пяти семейств обследования. Права остаются в guard: репозиторий — только данные.
 * `findProjectSettings` выносит справочники, `findMemberRole` — проверку «owner — участник».
 */
export type SurveyRepository = {
  findProjectSettings(projectId: string): Promise<ProjectSettings | null>

  findDomainById(domainId: string): Promise<{ id: string; projectId: string } | null>

  findMemberRole(projectId: string, userId: string): Promise<string | null>

  // Факты
  listFacts(projectId: string, query: FactsQuery): Promise<FactWithFindingsRow[]>

  createFact(input: Omit<FactRow, 'id' | 'createdAt'>): Promise<FactRow>

  findFactById(factId: string): Promise<FactRow | null>

  findFactWithFindingsById(factId: string): Promise<FactWithFindingsRow | null>

  updateFact(factId: string, data: Partial<Pick<FactRow, 'domainId' | 'kind' | 'typeKey' | 'title' | 'description' | 'shop' | 'factDate' | 'objectKey' | 'fileName'>>): Promise<FactRow | null>

  deleteFact(factId: string): Promise<boolean>

  // Гайды
  listGuides(projectId: string): Promise<GuideTreeRow[]>

  findGuideTreeById(guideId: string): Promise<GuideTreeRow | null>

  findGuideById(guideId: string): Promise<GuideRow | null>

  createGuide(input: CreateGuideWrite): Promise<GuideTreeRow>

  updateGuide(guideId: string, data: Partial<Pick<GuideRow, 'name'>>): Promise<GuideRow | null>

  deleteGuide(guideId: string): Promise<boolean>

  createGuideSection(input: { guideId: string; title: string; sortOrder: number }): Promise<GuideSectionRow>

  findGuideSectionById(sectionId: string): Promise<(GuideSectionRow & { questions: GuideQuestionRow[] }) | null>

  updateGuideSection(sectionId: string, data: Partial<Pick<GuideSectionRow, 'title' | 'sortOrder'>>): Promise<GuideSectionRow | null>

  deleteGuideSection(sectionId: string): Promise<boolean>

  createGuideQuestion(input: { sectionId: string; type: GuideQuestionType; text: string; options: string[]; showIfQuestionId: string | null; showIfValue: string | null; sortOrder: number }): Promise<GuideQuestionRow>

  findGuideQuestionById(questionId: string): Promise<(GuideQuestionRow & { section: GuideSectionRow }) | null>

  updateGuideQuestion(questionId: string, data: Partial<Pick<GuideQuestionRow, 'type' | 'text' | 'options' | 'showIfQuestionId' | 'showIfValue' | 'sortOrder'>>): Promise<GuideQuestionRow | null>

  deleteGuideQuestion(questionId: string): Promise<boolean>

  /** Снимок гайда для дубля: секции и вопросы с их id (для перевязки showIf). */
  copyGuide(guideId: string, name: string): Promise<GuideTreeRow>

  // Интервью
  listInterviews(projectId: string, query: InterviewsQuery): Promise<InterviewRow[]>

  createInterview(input: Omit<InterviewRow, 'id'>): Promise<InterviewRow>

  findInterviewById(interviewId: string): Promise<InterviewDetailRow | null>

  updateInterview(interviewId: string, data: Partial<Pick<InterviewRow, 'domainId' | 'guideId' | 'scheduledAt' | 'respondent' | 'respondentRole' | 'status' | 'notes'>>): Promise<InterviewRow | null>

  deleteInterview(interviewId: string): Promise<boolean>

  /** Полная замена ответов интервью в одной транзакции. */
  replaceInterviewAnswers(interviewId: string, answers: Array<{ questionId: string; value: unknown }>): Promise<InterviewAnswerRow[]>

  // Запросы данных
  listDataRequests(projectId: string): Promise<DataRequestRow[]>

  createDataRequest(input: Omit<DataRequestRow, 'id' | 'createdAt' | 'updatedAt'>): Promise<DataRequestRow>

  findDataRequestById(requestId: string): Promise<DataRequestRow | null>

  updateDataRequest(requestId: string, data: Partial<Pick<DataRequestRow, 'domainId' | 'assigneeId' | 'what' | 'why' | 'deadline' | 'status' | 'receivedAt'>>): Promise<DataRequestRow | null>

  deleteDataRequest(requestId: string): Promise<boolean>

  // Находки
  listFindings(projectId: string, query: FindingsQuery): Promise<FindingRow[]>

  createFinding(input: Omit<FindingRow, 'id' | 'createdAt' | 'updatedAt'>): Promise<FindingRow>

  findFindingById(findingId: string): Promise<FindingRow | null>

  updateFinding(findingId: string, data: Partial<Pick<FindingRow, 'domainId' | 'factId' | 'ownerId' | 'title' | 'description' | 'category' | 'priority' | 'status'>>): Promise<FindingRow | null>

  deleteFinding(findingId: string): Promise<boolean>

  /** Массовая смена статуса; возвращает число реально обновлённых строк этого проекта. */
  bulkUpdateFindingStatus(projectId: string, ids: string[], status: string): Promise<number>

  findFactByIdForProject(projectId: string, factId: string): Promise<{ id: string } | null>

  findUserById(userId: string): Promise<{ id: string } | null>
}

// ============================================================
// Тикеты загрузки файлов фактов
// ============================================================

export type FactUploadClaims = {
  factId: string
  objectKey: string
  contentType: string
  byteSize: number
  /// Unix-секунды, когда тикет перестаёт приниматься.
  expiresAt: number
}

/**
 * Самоподписанный тикет вместо строки БД (как pending-строка аватаров): подтверждение готовности
 * проверяет подпись, а не доверяет присланным objectKey/размеру.
 */
export type FactUploadTokens = {
  issue(claims: FactUploadClaims): string
  verify(factId: string, token: string, now: Date): FactUploadClaims | null
}

export type FactUploadTicketResult = {
  ticket: FactUploadTicket
  claims: FactUploadClaims
}
