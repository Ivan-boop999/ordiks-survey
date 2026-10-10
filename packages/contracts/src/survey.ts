import { z } from 'zod'

/**
 * Shared vocabulary of the survey domain: organization roles, project membership roles, and the
 * status enums mirrored from `backend/prisma/schema/survey.prisma`. Every DTO file imports from
 * here instead of redefining an enum, so a Prisma rename surfaces as one contract change.
 */

/// Глобальная роль в организации ОРДИКС. Команда (owner/manager/analyst) видит все проекты;
/// client — только проекты, в которые его добавили по членству.
export const orgRoleSchema = z.enum(['owner', 'manager', 'analyst', 'client'])
export type OrgRole = z.infer<typeof orgRoleSchema>

export const TEAM_ORG_ROLES = ['owner', 'manager', 'analyst'] as const

/// Роль участника в конкретном проекте: для команды дублирует глобальную роль,
/// для заказчика задаёт уровень доступа в портале.
export const memberRoleSchema = z.enum([
  'manager',
  'analyst',
  'client_lead',
  'client_staff',
  'observer',
])
export type MemberRole = z.infer<typeof memberRoleSchema>

export const projectStatusSchema = z.enum(['active', 'archived'])
export type ProjectStatus = z.infer<typeof projectStatusSchema>

export const stageStatusSchema = z.enum(['planned', 'active', 'done'])
export type StageStatus = z.infer<typeof stageStatusSchema>

export const taskStatusSchema = z.enum(['todo', 'doing', 'done', 'cancelled'])
export type TaskStatus = z.infer<typeof taskStatusSchema>

export const domainStatusSchema = z.enum(['not_started', 'in_progress', 'closed'])
export type DomainStatus = z.infer<typeof domainStatusSchema>

export const interviewStatusSchema = z.enum(['planned', 'done', 'formatted'])
export type InterviewStatus = z.infer<typeof interviewStatusSchema>

export const requestStatusSchema = z.enum(['requested', 'in_progress', 'received'])
export type RequestStatus = z.infer<typeof requestStatusSchema>

/// Сторона процесса: фактическая (AS-IS) или целевая (TO-BE).
export const processSideSchema = z.enum(['asis', 'tobe'])
export type ProcessSide = z.infer<typeof processSideSchema>

/// Тип объекта треда комментариев (зеркало enum ThreadType в Prisma); `report` — раздел отчёта.
export const threadTypeSchema = z.enum([
  'fact',
  'finding',
  'interview',
  'task',
  'request',
  'domain',
  'process',
  'report',
  'registry_entry',
])
export type ThreadType = z.infer<typeof threadTypeSchema>

/// Поведение ввода факта: фото (камера/галерея), файл (документ) или текстовая заметка.
export const factKindSchema = z.enum(['photo', 'file', 'note'])
export type FactKind = z.infer<typeof factKindSchema>

/// Тип вопроса гайда: текст / да-нет / шкала 1..5 / один вариант / несколько вариантов.
export const guideQuestionTypeSchema = z.enum(['text', 'yn', 'scale', 'choice', 'multi'])
export type GuideQuestionType = z.infer<typeof guideQuestionTypeSchema>

/**
 * Значение ответа интервью: строка (text/yn/scale/choice), число (scale допустим и числом —
 * прототип шлёт строки, API нормализует), массив выбранных вариантов (multi) или null
 * («не отвечено»; такой ответ не сохраняется вовсе).
 */
export const answerValueSchema = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.array(z.string().max(200)).max(50),
  z.null(),
])
export type AnswerValue = z.infer<typeof answerValueSchema>

/** Что разрешено пользователю в проекте; сервер считает это на каждый запрос. */
export const projectAccessSchema = z
  .object({
    view: z.boolean(),
    comment: z.boolean(),
    edit: z.boolean(),
  })
  .strict()
export type ProjectAccess = z.infer<typeof projectAccessSchema>
