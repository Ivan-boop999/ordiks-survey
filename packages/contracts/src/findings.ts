import { z } from 'zod'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()

// ============================================================
// Находки (реестр проблем)
// ============================================================

export const findingSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    domainId: z.string().nullable(),
    factId: z.string().nullable(),
    ownerId: z.string().nullable(),
    title: z.string(),
    description: z.string(),
    /// Строки из справочников проекта (settings), с дефолтами прототипа как фолбэком.
    category: z.string(),
    priority: z.string(),
    status: z.string(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
export type FindingDto = z.infer<typeof findingSchema>

export const findingsResponseSchema = z
  .object({
    items: z.array(findingSchema),
  })
  .strict()

export const findingsQuerySchema = z
  .object({
    domainId: uuidSchema.optional(),
    priority: z.string().trim().min(1).max(80).optional(),
    status: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
export type FindingsQuery = z.infer<typeof findingsQuerySchema>

const findingCoreSchema = {
  title: z.string().trim().min(1).max(300),
  description: z.string().max(8000).default(''),
  category: z.string().trim().min(1).max(80).optional(),
  priority: z.string().trim().min(1).max(80).optional(),
  status: z.string().trim().min(1).max(80).optional(),
  domainId: uuidSchema.nullish(),
  factId: uuidSchema.nullish(),
  /// Владелец — участник проекта.
  ownerId: uuidSchema.nullish(),
}

export const createFindingRequestSchema = z.object(findingCoreSchema).strict()
export type CreateFindingRequest = z.infer<typeof createFindingRequestSchema>

export const updateFindingRequestSchema = z
  .object({
    ...findingCoreSchema,
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(8000).optional(),
  })
  .strict()
export type UpdateFindingRequest = z.infer<typeof updateFindingRequestSchema>

/** Массовая смена статуса — только команда ОРДИКС. */
export const bulkUpdateFindingsRequestSchema = z
  .object({
    ids: z.array(uuidSchema).min(1).max(500),
    status: z.string().trim().min(1).max(80),
  })
  .strict()
export type BulkUpdateFindingsRequest = z.infer<typeof bulkUpdateFindingsRequestSchema>

export const bulkUpdateFindingsResponseSchema = z
  .object({
    /// Сколько записей реально обновлено (неизвестные id из чужих проектов молча пропускаются).
    updated: z.number().int().nonnegative(),
  })
  .strict()
export type BulkUpdateFindingsResponse = z.infer<typeof bulkUpdateFindingsResponseSchema>

export const findingParamsSchema = z
  .object({
    findingId: uuidSchema,
  })
  .strict()
