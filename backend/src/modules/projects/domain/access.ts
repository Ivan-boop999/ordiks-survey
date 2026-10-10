import {
  TEAM_ORG_ROLES,
  type MemberRole,
  type OrgRole,
  type ProjectAccess,
} from '@ordiks-survey/contracts'

/**
 * Правила доступа к проекту (чистые, без БД):
 *
 * - команда ОРДИКС (orgRole owner/manager/analyst) имеет полный доступ ко всем проектам;
 * - client — только через членство (ProjectMember);
 * - edit (создание/правка структуры и паспорта) — только команда;
 * - client_lead/client_staff — чтение, комментарии, смена статуса запросов, визы (в следующих волнах);
 * - observer — только чтение.
 */

/// Роли участника, которым разрешено комментировать (прототип: Perm.comment()).
const COMMENT_MEMBER_ROLES: readonly MemberRole[] = [
  'manager',
  'analyst',
  'client_lead',
  'client_staff',
]

export type ProjectAccessContext = {
  orgRole: OrgRole
  memberRole: MemberRole | null
}

export function isTeamOrgRole(orgRole: OrgRole): orgRole is (typeof TEAM_ORG_ROLES)[number] {
  return (TEAM_ORG_ROLES as readonly string[]).includes(orgRole)
}

export function accessFor({ orgRole, memberRole }: ProjectAccessContext): ProjectAccess {
  const edit = isTeamOrgRole(orgRole)
  return {
    edit,
    comment: edit || (memberRole !== null && COMMENT_MEMBER_ROLES.includes(memberRole)),
    view: edit || memberRole !== null,
  }
}

export function canEditProject(context: ProjectAccessContext): boolean {
  return accessFor(context).edit
}

export function canViewProject(context: ProjectAccessContext): boolean {
  return accessFor(context).view
}

/// Управление составом проекта (добавление/удаление/смена роли) — только owner и manager.
export function canManageMembers(orgRole: OrgRole): boolean {
  return orgRole === 'owner' || orgRole === 'manager'
}
