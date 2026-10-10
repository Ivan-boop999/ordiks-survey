import type {
  AcceptInviteRequest,
  AcceptInviteResponse,
  CreateInviteRequest,
  InviteDto,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import { canGrantOwnerRole, canManageInvites } from '../domain/access'
import { InvitesFailure } from '../domain/errors'
import type {
  Clock,
  InvitesRepository,
  InviteCodes,
  InviteRecord,
  PasswordHasher,
} from './ports'

type InvitesServiceDependencies = {
  clock: Clock
  codes: InviteCodes
  hasher: PasswordHasher
  repository: InvitesRepository
}

/** Приглашения: выпуск кодов командой и публичный вход по коду. */
export class InvitesService {
  constructor(private readonly dependencies: InvitesServiceDependencies) {}

  async listInvites(principal: AuthenticatedPrincipal): Promise<InviteDto[]> {
    this.requireManager(principal)
    const now = this.dependencies.clock.now()
    return (await this.dependencies.repository.listInvites()).map((invite) =>
      inviteDto(invite, now),
    )
  }

  async createInvite(principal: AuthenticatedPrincipal, input: CreateInviteRequest): Promise<InviteDto> {
    this.requireManager(principal)
    if (input.orgRole === 'owner' && !canGrantOwnerRole(principal.orgRole)) {
      throw new InvitesFailure('forbidden', 'Only the owner can invite another owner')
    }

    let projectId: string | null = null
    if (input.projectId !== undefined) {
      const project = await this.dependencies.repository.findProjectById(input.projectId)
      if (!project) throw new InvitesFailure('not_found', 'Project not found')
      projectId = input.projectId
    }

    const invite = await this.dependencies.repository.createInvite({
      code: this.dependencies.codes.generate(),
      orgRole: input.orgRole,
      projectId,
      memberRole: input.memberRole ?? null,
      note: input.note,
      createdById: principal.id,
      expiresAt: input.expiresAt ?? null,
    })
    return inviteDto(invite, this.dependencies.clock.now())
  }

  async deactivateInvite(principal: AuthenticatedPrincipal, inviteId: string): Promise<InviteDto> {
    this.requireManager(principal)
    // Отдельной колонки активности нет: деактивация = мгновенное истечение срока.
    const invite = await this.dependencies.repository.deactivateInvite(
      inviteId,
      this.dependencies.clock.now(),
    )
    if (!invite) throw new InvitesFailure('not_found', 'Invite not found')
    return inviteDto(invite, this.dependencies.clock.now())
  }

  /** Публичный вход по коду: создаёт аккаунт и сразу даёт роль/членство из инвайта. */
  async acceptInvite(input: AcceptInviteRequest): Promise<AcceptInviteResponse> {
    const now = this.dependencies.clock.now()
    const invite = await this.dependencies.repository.findInviteByCode(input.code)
    if (!invite || invite.usedById !== null || (invite.expiresAt !== null && invite.expiresAt <= now)) {
      throw new InvitesFailure('invalid', 'Invite code is invalid, already used, or expired')
    }

    const outcome = await this.dependencies.repository.acceptInvite({
      invite,
      email: input.email,
      passwordHash: await this.dependencies.hasher.hash(input.password),
      displayName: input.displayName ?? null,
      now,
    })
    if (!outcome.accepted) {
      throw new InvitesFailure(
        outcome.reason === 'email_taken' ? 'conflict' : 'invalid',
        outcome.reason === 'email_taken'
          ? 'User with this email already exists'
          : 'Invite code is invalid, already used, or expired',
      )
    }

    return {
      userId: outcome.userId,
      email: input.email,
      displayName: input.displayName ?? null,
      orgRole: invite.orgRole,
      projectId: invite.projectId,
      memberRole: invite.memberRole,
    }
  }

  private requireManager(principal: AuthenticatedPrincipal) {
    if (!canManageInvites(principal.orgRole)) {
      throw new InvitesFailure('forbidden', 'Only owners and managers can manage invites')
    }
  }
}

function inviteDto(invite: InviteRecord, now: Date): InviteDto {
  return {
    id: invite.id,
    code: invite.code,
    projectId: invite.projectId,
    orgRole: invite.orgRole,
    memberRole: invite.memberRole,
    note: invite.note,
    createdById: invite.createdById,
    usedById: invite.usedById,
    usedAt: invite.usedAt?.toISOString() ?? null,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
    active: invite.usedById === null && (invite.expiresAt === null || invite.expiresAt > now),
  }
}
