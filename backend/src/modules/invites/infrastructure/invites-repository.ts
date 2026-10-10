import type { DbClient } from '../../../db'
import { Prisma } from '../../../generated/prisma/client'
import { InvitesFailure } from '../domain/errors'
import type { AcceptInviteOutcome, InvitesRepository, InviteRecord } from '../application/ports'

const inviteSelect = {
  id: true,
  code: true,
  projectId: true,
  orgRole: true,
  memberRole: true,
  note: true,
  createdById: true,
  usedById: true,
  usedAt: true,
  expiresAt: true,
  createdAt: true,
} as const

type InviteRow = {
  id: string
  code: string
  projectId: string | null
  orgRole: InviteRecord['orgRole']
  memberRole: InviteRecord['memberRole']
  note: string
  createdById: string
  usedById: string | null
  usedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

export function createPrismaInvitesRepository(db: DbClient): InvitesRepository {
  return {
    findInviteByCode(code) {
      return db.invite
        .findUnique({ where: { code }, select: inviteSelect })
        .then((row) => row ?? null)
    },

    listInvites() {
      return db.invite.findMany({ orderBy: { createdAt: 'desc' }, select: inviteSelect })
    },

    async createInvite(input) {
      // Коллизии кодов маловероятны, но уникальный индекс всё же может сработать — просто
      // перегенерируем, а не возвращаем клиенту 500.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          return await db.invite.create({ data: input, select: inviteSelect })
        } catch (error) {
          if (!isUniqueConstraintFailure(error)) throw error
        }
      }
      throw new InvitesFailure('conflict', 'Could not generate a unique invite code')
    },

    deactivateInvite(inviteId, expiresAt) {
      return db.invite
        .update({ where: { id: inviteId }, data: { expiresAt }, select: inviteSelect })
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    findProjectById(projectId) {
      return db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    },

    async acceptInvite(input): Promise<AcceptInviteOutcome> {
      try {
        return await db.$transaction(async (tx) => {
          // Повторная проверка под транзакцией: код могли использовать между чтением и записью.
          const invite = await tx.invite.findUnique({
            where: { id: input.invite.id },
            select: inviteSelect,
          })
          if (
            !invite ||
            invite.usedById !== null ||
            (invite.expiresAt !== null && invite.expiresAt <= input.now)
          ) {
            return { accepted: false as const, reason: 'invite_used' as const }
          }

          const user = await tx.user.create({
            data: {
              email: input.email,
              passwordHash: input.passwordHash,
              displayName: input.displayName,
              role: 'user',
              orgRole: invite.orgRole,
            },
            select: { id: true },
          })
          if (invite.projectId !== null && invite.memberRole !== null) {
            await tx.projectMember.create({
              data: {
                projectId: invite.projectId,
                userId: user.id,
                role: invite.memberRole,
              },
            })
          }
          const claimed = await tx.invite.updateMany({
            where: { id: invite.id, usedById: null },
            data: { usedById: user.id, usedAt: input.now },
          })
          if (claimed.count !== 1) {
            return { accepted: false as const, reason: 'invite_used' as const }
          }
          return { accepted: true as const, userId: user.id }
        })
      } catch (error) {
        if (isUniqueConstraintFailure(error)) {
          return { accepted: false, reason: 'email_taken' }
        }
        throw error
      }
    },
  }
}

function isUniqueConstraintFailure(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function isRecordNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}

export type { InviteRow }
