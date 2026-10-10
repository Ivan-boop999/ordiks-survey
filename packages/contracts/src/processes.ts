import { z } from 'zod'

import { processSideSchema } from './survey'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()

// ============================================================
// Процессы AS-IS / TO-BE
// ============================================================

/**
 * Шаг процесса. Сторона задаётся при создании и не меняется. Связь в TO-BE — чистая:
 * `mapToStepId` ссылается на шаг tobe, а значение 'none' прототипа (шаг исчезает) —
 * отдельный флаг `disappears`; `mapToStepId=null` + `disappears=false` — «не определено».
 */
export const processStepSchema = z
  .object({
    id: idSchema,
    processId: idSchema,
    side: processSideSchema,
    title: z.string(),
    actorRole: z.string(),
    tools: z.array(z.string()),
    effect: z.string().nullable(),
    mapToStepId: z.string().nullable(),
    disappears: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict()
export type ProcessStepDto = z.infer<typeof processStepSchema>

/// Схема из StormBPMN: приватный объект в хранилище, доступ — по подписанному URL.
export const processSchemeSchema = z
  .object({
    side: processSideSchema,
    fileName: z.string(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
export type ProcessSchemeDto = z.infer<typeof processSchemeSchema>

export const processSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    name: z.string(),
    steps: z.array(processStepSchema),
    schemes: z.array(processSchemeSchema),
  })
  .strict()
export type ProcessDto = z.infer<typeof processSchema>

export const processesResponseSchema = z
  .object({
    items: z.array(processSchema),
  })
  .strict()

export const createProcessRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict()
export type CreateProcessRequest = z.infer<typeof createProcessRequestSchema>

export const updateProcessRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
export type UpdateProcessRequest = z.infer<typeof updateProcessRequestSchema>

export const processParamsSchema = z
  .object({
    processId: uuidSchema,
  })
  .strict()

export const processSideParamsSchema = z
  .object({
    processId: uuidSchema,
    side: processSideSchema,
  })
  .strict()

const stepCoreSchema = {
  side: processSideSchema,
  title: z.string().trim().min(1).max(300),
  actorRole: z.string().trim().max(160).default(''),
  /// Метки инструментов (Excel / 1С / бумага / …).
  tools: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  /// Осмысление шага TO-BE.
  effect: z.string().trim().max(1000).nullish(),
  /// Шаг TO-BE, в который переходит шаг AS-IS; только для шагов asis и в пределах процесса.
  mapToStepId: uuidSchema.nullish(),
  /// Шаг исчезает в TO-BE (mapTo='none' прототипа).
  disappears: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().optional(),
}

export const createProcessStepRequestSchema = z
  .object(stepCoreSchema)
  .strict()
  .refine(
    (value) => !(value.disappears === true && value.mapToStepId != null),
    'A step either maps to a TO-BE step or disappears, not both',
  )
export type CreateProcessStepRequest = z.infer<typeof createProcessStepRequestSchema>

export const updateProcessStepRequestSchema = z
  .object({
    ...stepCoreSchema,
    side: processSideSchema.optional(),
    title: z.string().trim().min(1).max(300).optional(),
    actorRole: z.string().trim().max(160).optional(),
    tools: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .strict()
  .refine(
    (value) => !(value.disappears === true && value.mapToStepId != null),
    'A step either maps to a TO-BE step or disappears, not both',
  )
export type UpdateProcessStepRequest = z.infer<typeof updateProcessStepRequestSchema>

export const reorderProcessStepsRequestSchema = z
  .object({
    side: processSideSchema,
    /// Полный порядок id шагов этой стороны процесса.
    ids: z.array(uuidSchema).min(1).max(500),
  })
  .strict()
export type ReorderProcessStepsRequest = z.infer<typeof reorderProcessStepsRequestSchema>

export const processStepParamsSchema = z
  .object({
    stepId: uuidSchema,
  })
  .strict()

// ============================================================
// Схемы из StormBPMN: тикет → PUT в хранилище → подтверждение
// ============================================================

export const PROCESS_SCHEME_MIN_BYTES = 1
export const PROCESS_SCHEME_MAX_BYTES = 2 * 1024 * 1024

/// Только растровые/векторные схемы: png, svg, jpeg, webp (экспорт StormBPMN).
export const processSchemeContentTypeSchema = z.enum([
  'image/png',
  'image/svg+xml',
  'image/jpeg',
  'image/webp',
])

export const createProcessSchemeUploadRequestSchema = z
  .object({
    contentType: processSchemeContentTypeSchema,
    byteSize: z
      .number()
      .int()
      .min(PROCESS_SCHEME_MIN_BYTES)
      .max(PROCESS_SCHEME_MAX_BYTES),
  })
  .strict()
export type CreateProcessSchemeUploadRequest = z.infer<typeof createProcessSchemeUploadRequestSchema>

const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, 'Storage URLs must use http or https')

export const processSchemeUploadTicketSchema = z
  .object({
    token: z.string().min(1).max(1024),
    method: z.literal('PUT'),
    url: httpUrlSchema,
    headers: z.record(z.string(), z.string()),
    contentLength: z.number().int().positive(),
    expiresAt: z.string().datetime(),
  })
  .strict()
export type ProcessSchemeUploadTicket = z.infer<typeof processSchemeUploadTicketSchema>

export const createProcessSchemeUploadResponseSchema = z
  .object({
    upload: processSchemeUploadTicketSchema,
  })
  .strict()
export type CreateProcessSchemeUploadResponse = z.infer<typeof createProcessSchemeUploadResponseSchema>

export const confirmProcessSchemeUploadRequestSchema = z
  .object({
    token: z.string().min(1).max(1024),
    fileName: z.string().trim().min(1).max(255),
  })
  .strict()
export type ConfirmProcessSchemeUploadRequest = z.infer<typeof confirmProcessSchemeUploadRequestSchema>

export const processSchemeDownloadSchema = z
  .object({
    url: httpUrlSchema,
    expiresAt: z.string().datetime(),
  })
  .strict()
export type ProcessSchemeDownload = z.infer<typeof processSchemeDownloadSchema>
