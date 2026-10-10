import { z } from 'zod'

import {
  factTypeSchema,
  findingStatusItemSchema,
  passportFieldSchema,
  projectTemplateSchema,
} from './projects'
import { guideQuestionTypeSchema } from './survey'
import {
  registryFormulaSchema,
  registryFieldTypeSchema,
} from './registries'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()

// ============================================================
// Библиотека методик: снимок структуры проекта без записей и прогресса
// ============================================================

/// Гайд в payload шаблона: вопросы несут clientRefId для перевязки showIf новыми id.
export const templateGuideSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    sections: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            questions: z
              .array(
                z
                  .object({
                    clientRefId: z.string().trim().min(1).max(64),
                    type: guideQuestionTypeSchema,
                    text: z.string().trim().min(1).max(1000),
                    options: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
                    /// clientRefId вопроса-источника условия.
                    showIfClientRefId: z.string().trim().min(1).max(64).nullish(),
                    showIfValue: z.string().max(200).nullish(),
                  })
                  .strict(),
              )
              .max(200)
              .default([]),
          })
          .strict(),
      )
      .max(50)
      .default([]),
  })
  .strict()
export type TemplateGuide = z.infer<typeof templateGuideSchema>

/// Свой реестр в payload шаблона: структура (поля+статусы), записи не копируются.
export const templateRegistrySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).default(''),
    fields: z
      .array(
        z
          .object({
            key: z.string().trim().min(1).max(64),
            name: z.string().trim().min(1).max(160),
            type: registryFieldTypeSchema,
            options: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
            formula: registryFormulaSchema.nullish(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    statuses: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            color: z.enum(['gray', 'blue', 'purple', 'amber', 'red', 'green']),
          })
          .strict(),
      )
      .max(50)
      .default([]),
  })
  .strict()
export type TemplateRegistry = z.infer<typeof templateRegistrySchema>

/// Справочники в payload шаблона: статусы находок, типы фактов, поля паспорта, категории/приоритеты.
export const templateDictionariesSchema = z
  .object({
    findingCategories: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    findingPriorities: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    findingStatuses: z.array(findingStatusItemSchema).max(50).default([]),
    factTypes: z.array(factTypeSchema).max(50).default([]),
    passportFields: z.array(passportFieldSchema).max(100).default([]),
  })
  .strict()
export type TemplateDictionaries = z.infer<typeof templateDictionariesSchema>

/**
 * Payload сохранённого шаблона: этапы + дерево доменов + разделы отчёта + гайды +
 * справочники + свои реестры. Надмножество инлайн-шаблона создания проекта
 * (`projectTemplateSchema`); при разворачивании все id генерируются заново.
 */
export const projectTemplatePayloadSchema = projectTemplateSchema
  .extend({
    reportSections: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
    guides: z.array(templateGuideSchema).max(50).default([]),
    /// prefault: пустой вход прогоняется через схему справочника и даёт все дефолты.
    dictionaries: templateDictionariesSchema.prefault({}),
    registries: z.array(templateRegistrySchema).max(50).default([]),
    /// Откуда шаблон: имя проекта-источника или null для стандартных.
    fromProject: z.string().max(160).nullable().default(null),
  })
  .strict()
export type ProjectTemplatePayload = z.infer<typeof projectTemplatePayloadSchema>

export const projectTemplateRecordSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    description: z.string(),
    payload: projectTemplatePayloadSchema,
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
export type ProjectTemplateRecordDto = z.infer<typeof projectTemplateRecordSchema>

export const projectTemplatesResponseSchema = z
  .object({
    items: z.array(projectTemplateRecordSchema),
  })
  .strict()

export const createProjectTemplateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().max(4000).default(''),
    payload: projectTemplatePayloadSchema,
  })
  .strict()
export type CreateProjectTemplateRequest = z.infer<typeof createProjectTemplateRequestSchema>

export const updateProjectTemplateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(4000).optional(),
    payload: projectTemplatePayloadSchema.optional(),
  })
  .strict()
export type UpdateProjectTemplateRequest = z.infer<typeof updateProjectTemplateRequestSchema>

export const projectTemplateParamsSchema = z
  .object({
    templateId: uuidSchema,
  })
  .strict()

export const createProjectFromTemplateRequestSchema = z
  .object({
    templateId: uuidSchema,
    name: z.string().trim().min(2).max(160),
    client: z.string().trim().max(160).default(''),
    city: z.string().trim().max(120).default(''),
    shops: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  })
  .strict()
export type CreateProjectFromTemplateRequest = z.infer<typeof createProjectFromTemplateRequestSchema>

export const projectToTemplateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().max(4000).default(''),
  })
  .strict()
export type ProjectToTemplateRequest = z.infer<typeof projectToTemplateRequestSchema>
