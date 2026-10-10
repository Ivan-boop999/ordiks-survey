import { z } from 'zod'

import { requestStatusSchema } from './survey'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()
const nullableDateTime = z.union([isoDateTime, z.null()])

// ============================================================
// Запросы данных к заказчику
// ============================================================

export const dataRequestSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    domainId: z.string().nullable(),
    assigneeId: z.string().nullable(),
    what: z.string(),
    why: z.string(),
    deadline: nullableDateTime,
    status: requestStatusSchema,
    receivedAt: nullableDateTime,
    /// Вычисляется на лету: дедлайн прошёл, а статус ещё не received.
    overdue: z.boolean(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
export type DataRequestDto = z.infer<typeof dataRequestSchema>

export const dataRequestsResponseSchema = z
  .object({
    items: z.array(dataRequestSchema),
  })
  .strict()

export const dataRequestsQuerySchema = z
  .object({
    status: requestStatusSchema.optional(),
    domainId: uuidSchema.optional(),
    /// Только просроченные (или только не просроченные при false). Строка запроса, поэтому
    /// булево разбираем явно: coerce превратил бы "false" в true.
    overdue: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict()
export type DataRequestsQuery = z.infer<typeof dataRequestsQuerySchema>

const requestCoreSchema = {
  what: z.string().trim().min(1).max(500),
  why: z.string().max(2000).default(''),
  domainId: uuidSchema.nullish(),
  /// Ответственный со стороны заказчика — участник проекта.
  assigneeId: uuidSchema.nullish(),
  deadline: z.coerce.date().nullish(),
  status: requestStatusSchema.optional(),
}

export const createDataRequestRequestSchema = z.object(requestCoreSchema).strict()
export type CreateDataRequestRequest = z.infer<typeof createDataRequestRequestSchema>

export const updateDataRequestRequestSchema = z
  .object({
    ...requestCoreSchema,
    what: z.string().trim().min(1).max(500).optional(),
    why: z.string().max(2000).optional(),
  })
  .strict()
export type UpdateDataRequestRequest = z.infer<typeof updateDataRequestRequestSchema>

/** Смена статуса — единственное, что могут клиентские роли (client_lead/client_staff). */
export const updateDataRequestStatusRequestSchema = z
  .object({
    status: requestStatusSchema,
  })
  .strict()
export type UpdateDataRequestStatusRequest = z.infer<typeof updateDataRequestStatusRequestSchema>

export const dataRequestParamsSchema = z
  .object({
    requestId: uuidSchema,
  })
  .strict()
