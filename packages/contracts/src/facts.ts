import { z } from 'zod'

import { factKindSchema } from './survey'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()
const nullableDateTime = z.union([isoDateTime, z.null()])

// ============================================================
// Факты
// ============================================================

export const FACT_MIN_BYTES = 1
export const FACT_MAX_BYTES = 50 * 1024 * 1024

/** Любой валидный MIME-тип: фото, документы выгрузок, регламенты — не только картинки. */
export const factContentTypeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(255)
  .regex(
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/,
    'Content type must be a valid MIME type',
  )

/** Связанная находка в DTO факта: «спросить findingId у факта» без отдельного запроса. */
export const factFindingRefSchema = z
  .object({
    id: idSchema,
    title: z.string(),
    status: z.string(),
  })
  .strict()
export type FactFindingRef = z.infer<typeof factFindingRefSchema>

export const factSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    domainId: z.string().nullable(),
    authorId: idSchema,
    kind: factKindSchema,
    typeKey: z.string(),
    title: z.string(),
    description: z.string(),
    shop: z.string(),
    factDate: isoDateTime,
    /// Приватный объект хранилища; выдаётся только через подписанный URL скачивания.
    objectKey: z.string().nullable(),
    fileName: z.string().nullable(),
    createdAt: isoDateTime,
    findings: z.array(factFindingRefSchema),
  })
  .strict()
export type FactDto = z.infer<typeof factSchema>

export const factsResponseSchema = z
  .object({
    items: z.array(factSchema),
  })
  .strict()

export const factsQuerySchema = z
  .object({
    domainId: uuidSchema.optional(),
    shop: z.string().trim().min(1).max(120).optional(),
    kind: factKindSchema.optional(),
    typeKey: z.string().trim().min(1).max(64).optional(),
    authorId: uuidSchema.optional(),
    /// Поиск по title+description (регистронезависимый).
    q: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
export type FactsQuery = z.infer<typeof factsQuerySchema>

const factCoreSchema = {
  kind: factKindSchema,
  /// Ключ типа факта из справочника settings.factTypes; по умолчанию совпадает с kind.
  typeKey: z.string().trim().min(1).max(64).optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(4000).default(''),
  shop: z.string().trim().max(120).default(''),
  factDate: z.coerce.date().optional(),
  domainId: uuidSchema.nullish(),
  /// Имя файла-ярлык (например, для выгрузок без загрузки в хранилище); сами байты — только через upload-flow.
  fileName: z.string().trim().max(255).nullish(),
}

export const createFactRequestSchema = z.object(factCoreSchema).strict()
export type CreateFactRequest = z.infer<typeof createFactRequestSchema>

export const updateFactRequestSchema = z
  .object({
    ...factCoreSchema,
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(4000).optional(),
    shop: z.string().trim().max(120).optional(),
  })
  .strict()
export type UpdateFactRequest = z.infer<typeof updateFactRequestSchema>

export const factParamsSchema = z
  .object({
    factId: uuidSchema,
  })
  .strict()

// ============================================================
// Загрузка/скачивание файла факта (приватное хранилище)
// ============================================================

export const createFactUploadRequestSchema = z
  .object({
    contentType: factContentTypeSchema,
    byteSize: z.number().int().min(FACT_MIN_BYTES).max(FACT_MAX_BYTES),
  })
  .strict()
export type CreateFactUploadRequest = z.infer<typeof createFactUploadRequestSchema>

const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return false
    }
    return url.protocol === 'http:' || url.protocol === 'https:'
  }, 'Storage URLs must use http or https')

/**
 * Тикет загрузки файла факта. Как у аватаров: браузер льёт байты прямо в хранилище по
 * подписанному PUT, затем подтверждает готовность. Вместо строки БД тикет самоподписан
 * (token) и связывает факт, ключ объекта, тип и размер.
 */
export const factUploadTicketSchema = z
  .object({
    token: z.string().min(1).max(1024),
    method: z.literal('PUT'),
    url: httpUrlSchema,
    /** Повторить дословно. Включает Content-Type и If-None-Match: *; оба в подписи. */
    headers: z.record(z.string(), z.string()),
    contentLength: z.number().int().positive(),
    expiresAt: z.string().datetime(),
  })
  .strict()
export type FactUploadTicket = z.infer<typeof factUploadTicketSchema>

export const createFactUploadResponseSchema = z
  .object({
    upload: factUploadTicketSchema,
  })
  .strict()
export type CreateFactUploadResponse = z.infer<typeof createFactUploadResponseSchema>

export const confirmFactUploadRequestSchema = z
  .object({
    token: z.string().min(1).max(1024),
    fileName: z.string().trim().min(1).max(255),
  })
  .strict()
export type ConfirmFactUploadRequest = z.infer<typeof confirmFactUploadRequestSchema>

export const factFileDownloadSchema = z
  .object({
    url: httpUrlSchema,
    expiresAt: z.string().datetime(),
  })
  .strict()
export type FactFileDownload = z.infer<typeof factFileDownloadSchema>
