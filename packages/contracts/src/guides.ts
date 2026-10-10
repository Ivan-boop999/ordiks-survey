import { z } from 'zod'

import { guideQuestionTypeSchema } from './survey'

const idSchema = z.string().min(1)
const uuidSchema = z.uuid()
const isoDateTime = z.string().datetime()

// ============================================================
// Гайды (опросники): секции и вопросы с условным показом
// ============================================================

export const guideQuestionSchema = z
  .object({
    id: idSchema,
    sectionId: idSchema,
    type: guideQuestionTypeSchema,
    text: z.string(),
    /// Варианты для choice/multi; для остальных пустой массив.
    options: z.array(z.string()),
    /// Условный показ: вопрос виден только когда ответ на showIfQuestionId равен showIfValue.
    showIfQuestionId: z.string().nullable(),
    showIfValue: z.string().nullable(),
    sortOrder: z.number().int(),
  })
  .strict()
export type GuideQuestionDto = z.infer<typeof guideQuestionSchema>

export const guideSectionSchema = z
  .object({
    id: idSchema,
    guideId: idSchema,
    title: z.string(),
    sortOrder: z.number().int(),
    questions: z.array(guideQuestionSchema),
  })
  .strict()
export type GuideSectionDto = z.infer<typeof guideSectionSchema>

export const guideSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    name: z.string(),
    createdAt: isoDateTime,
    sections: z.array(guideSectionSchema),
  })
  .strict()
export type GuideDto = z.infer<typeof guideSchema>

export const guidesResponseSchema = z
  .object({
    items: z.array(guideSchema),
  })
  .strict()

const questionWriteSchema = {
  type: guideQuestionTypeSchema,
  text: z.string().trim().min(1).max(1000),
  /// Обязательны и очищаются для choice/multi; для остальных игнорируются.
  options: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  /// Условный показ внутри того же гайда; showIfValue обязателен при showIfQuestionId.
  showIfQuestionId: uuidSchema.nullish(),
  showIfValue: z.string().trim().min(1).max(200).nullish(),
  sortOrder: z.number().int().nonnegative().optional(),
}

/** Гайд целиком при создании: имя + дерево секций/вопросов (для импорта из шаблона/библиотеки). */
export const createGuideRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    sections: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            sortOrder: z.number().int().nonnegative().optional(),
            questions: z.array(z.object(questionWriteSchema).strict()).max(100).default([]),
          })
          .strict(),
      )
      .max(50)
      .default([]),
  })
  .strict()
export type CreateGuideRequest = z.infer<typeof createGuideRequestSchema>

export const updateGuideRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
export type UpdateGuideRequest = z.infer<typeof updateGuideRequestSchema>

export const guideParamsSchema = z
  .object({
    guideId: uuidSchema,
  })
  .strict()

export const createGuideSectionRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type CreateGuideSectionRequest = z.infer<typeof createGuideSectionRequestSchema>

export const updateGuideSectionRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type UpdateGuideSectionRequest = z.infer<typeof updateGuideSectionRequestSchema>

export const guideSectionParamsSchema = z
  .object({
    sectionId: uuidSchema,
  })
  .strict()

export const createGuideQuestionRequestSchema = z.object(questionWriteSchema).strict()
export type CreateGuideQuestionRequest = z.infer<typeof createGuideQuestionRequestSchema>

export const updateGuideQuestionRequestSchema = z
  .object({
    ...questionWriteSchema,
    type: guideQuestionTypeSchema.optional(),
    text: z.string().trim().min(1).max(1000).optional(),
    options: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  })
  .strict()
export type UpdateGuideQuestionRequest = z.infer<typeof updateGuideQuestionRequestSchema>

export const guideQuestionParamsSchema = z
  .object({
    questionId: uuidSchema,
  })
  .strict()
