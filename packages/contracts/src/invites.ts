import { z } from 'zod'

import { emailSchema, passwordSchema } from './auth'
import { memberRoleSchema, orgRoleSchema } from './survey'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()

/**
 * Приглашение: код-ссылка для входа. Для сотрудников ОРДИКС задаёт глобальную роль;
 * для заказчика — дополнительно роль участника конкретного проекта (`projectId` + `memberRole`).
 */
export const inviteSchema = z
  .object({
    id: idSchema,
    code: z.string(),
    projectId: z.string().nullable(),
    orgRole: orgRoleSchema,
    memberRole: memberRoleSchema.nullable(),
    note: z.string(),
    createdById: idSchema,
    usedById: z.string().nullable(),
    usedAt: isoDateTime.nullable(),
    expiresAt: isoDateTime.nullable(),
    createdAt: isoDateTime,
    active: z.boolean(),
  })
  .strict()
export type InviteDto = z.infer<typeof inviteSchema>

export const invitesResponseSchema = z
  .object({
    items: z.array(inviteSchema),
  })
  .strict()
export type InvitesResponse = z.infer<typeof invitesResponseSchema>

export const createInviteRequestSchema = z
  .object({
    orgRole: orgRoleSchema,
    projectId: uuidSchema.optional(),
    memberRole: memberRoleSchema.optional(),
    note: z.string().trim().max(500).default(''),
    expiresAt: z.coerce.date().nullish(),
  })
  .strict()
  .refine((invite) => invite.projectId === undefined || invite.memberRole !== undefined, {
    message: 'memberRole is required when projectId is set',
    path: ['memberRole'],
  })
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>

export const inviteParamsSchema = z
  .object({
    inviteId: uuidSchema,
  })
  .strict()

export const acceptInviteRequestSchema = z
  .object({
    code: z.string().trim().min(4).max(64),
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(2).max(80).optional(),
  })
  .strict()
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>

export const acceptInviteResponseSchema = z
  .object({
    userId: idSchema,
    email: emailSchema,
    displayName: z.string().nullable(),
    orgRole: orgRoleSchema,
    projectId: z.string().nullable(),
    memberRole: memberRoleSchema.nullable(),
  })
  .strict()
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>
