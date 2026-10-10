import type { OrgRole } from '@ordiks-survey/contracts'

/** Создание и деактивация приглашений — только owner и manager. */
export function canManageInvites(orgRole: OrgRole): boolean {
  return orgRole === 'owner' || orgRole === 'manager'
}

/** Раздавать глобальную роль owner может только владелец. */
export function canGrantOwnerRole(orgRole: OrgRole): boolean {
  return orgRole === 'owner'
}
