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

/** Что разрешено пользователю в проекте; сервер считает это на каждый запрос. */
export const projectAccessSchema = z
  .object({
    view: z.boolean(),
    comment: z.boolean(),
    edit: z.boolean(),
  })
  .strict()
export type ProjectAccess = z.infer<typeof projectAccessSchema>
