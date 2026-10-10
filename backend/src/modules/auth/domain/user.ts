import type { OrgRole, UserDto, UserRole } from '@ordiks-survey/contracts'

export type AuthUserRecord = {
  id: string
  email: string
  passwordHash: string | null
  displayName: string | null
  role: UserRole
  orgRole: OrgRole
  createdAt: Date
}

export type AuthenticatedPrincipal = UserDto & {
  sessionId: string
}

export function toBaseUserDto(user: AuthUserRecord): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    orgRole: user.orgRole,
    createdAt: user.createdAt.toISOString(),
  }
}

export function userDtoFromPrincipal(principal: AuthenticatedPrincipal): UserDto {
  const { sessionId: _sessionId, ...user } = principal
  return user
}
