import { z } from 'zod'

import { answerValueSchema, interviewStatusSchema } from './survey'

const idSchema = z.string().min(1)
const uuidSchema = z.uuid()
const isoDateTime = z.string().datetime()

// ============================================================
// Интервью и ответы по гайду
// ============================================================

export const interviewSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    domainId: z.string().nullable(),
    guideId: z.string().nullable(),
    scheduledAt: isoDateTime,
    respondent: z.string(),
    respondentRole: z.string(),
    status: interviewStatusSchema,
    notes: z.string(),
  })
  .strict()
export type InterviewDto = z.infer<typeof interviewSchema>

export const interviewsResponseSchema = z
  .object({
    items: z.array(interviewSchema),
  })
  .strict()

export const interviewsQuerySchema = z
  .object({
    status: interviewStatusSchema.optional(),
    domainId: uuidSchema.optional(),
  })
  .strict()
export type InterviewsQuery = z.infer<typeof interviewsQuerySchema>

const interviewCoreSchema = {
  scheduledAt: z.coerce.date(),
  respondent: z.string().trim().min(1).max(200),
  respondentRole: z.string().trim().max(200).default(''),
  domainId: uuidSchema.nullish(),
  guideId: uuidSchema.nullish(),
  status: interviewStatusSchema.optional(),
  notes: z.string().max(20000).default(''),
}

export const createInterviewRequestSchema = z.object(interviewCoreSchema).strict()
export type CreateInterviewRequest = z.infer<typeof createInterviewRequestSchema>

export const updateInterviewRequestSchema = z
  .object({
    ...interviewCoreSchema,
    scheduledAt: z.coerce.date().optional(),
    respondent: z.string().trim().min(1).max(200).optional(),
    respondentRole: z.string().trim().max(200).optional(),
    notes: z.string().max(20000).optional(),
  })
  .strict()
export type UpdateInterviewRequest = z.infer<typeof updateInterviewRequestSchema>

export const interviewParamsSchema = z
  .object({
    interviewId: uuidSchema,
  })
  .strict()

export const interviewAnswerSchema = z
  .object({
    questionId: uuidSchema,
    value: answerValueSchema,
  })
  .strict()
export type InterviewAnswerDto = z.infer<typeof interviewAnswerSchema>

export const interviewDetailSchema = interviewSchema.extend({
  answers: z.array(interviewAnswerSchema),
})
export type InterviewDetailDto = z.infer<typeof interviewDetailSchema>

/**
 * Save-батч ответов: полная замена ответов интервью по гайду. Сервер валидирует значения по
 * типам вопросов, отбрасывает неотвеченные (null) и ответы на условные вопросы, чьё условие
 * не выполнено (как в прототипе).
 */
export const saveInterviewAnswersRequestSchema = z
  .object({
    answers: z.array(interviewAnswerSchema).max(500),
  })
  .strict()
export type SaveInterviewAnswersRequest = z.infer<typeof saveInterviewAnswersRequestSchema>

export const saveInterviewAnswersResponseSchema = z
  .object({
    interview: interviewDetailSchema,
    /// Сколько ответов из присланных сохранено (остальные отброшены: условие/пустые).
    saved: z.number().int().nonnegative(),
  })
  .strict()
export type SaveInterviewAnswersResponse = z.infer<typeof saveInterviewAnswersResponseSchema>
