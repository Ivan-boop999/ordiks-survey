import type { MemberRole, OrgRole } from '@ordiks-survey/contracts'

export type InviteRecord = {
  id: string
  code: string
  projectId: string | null
  orgRole: OrgRole
  memberRole: MemberRole | null
  note: string
  createdById: string
  usedById: string | null
  usedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

export type Clock = {
  now(): Date
}

export type InviteCodes = {
  generate(): string
}

export type PasswordHasher = {
  hash(password: string): Promise<string>
}

export type AcceptInviteOutcome =
  | { accepted: true; userId: string }
  | { accepted: false; reason: 'email_taken' | 'invite_used' }

export type InvitesRepository = {
  findInviteByCode(code: string): Promise<InviteRecord | null>

  listInvites(): Promise<InviteRecord[]>

  createInvite(input: {
    code: string
    orgRole: OrgRole
    projectId: string | null
    memberRole: MemberRole | null
    note: string
    createdById: string
    expiresAt: Date | null
  }): Promise<InviteRecord>

  deactivateInvite(inviteId: string, expiresAt: Date): Promise<InviteRecord | null>

  findProjectById(projectId: string): Promise<{ id: string } | null>

  /**
   * Атомарно принимает инвайт: повторно проверяет код внутри транзакции, создаёт пользователя
   * (и членство, если инвайт проектный) и помечает код использованным. Откат транзакции
   * снимает и создание пользователя, если код успел забрать конкурентным запросом.
   */
  acceptInvite(input: {
    invite: InviteRecord
    email: string
    passwordHash: string
    displayName: string | null
    now: Date
  }): Promise<AcceptInviteOutcome>
}
