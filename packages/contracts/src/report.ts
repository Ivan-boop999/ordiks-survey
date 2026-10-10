import { z } from 'zod'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()

// ============================================================
// Отчёт: разделы, визы, автовставки
// ============================================================

export const approvalDecisionSchema = z.enum(['approved', 'changes'])
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>

/// Виза на разделе: решение + комментарий; повторная виза того же пользователя перезаписывается.
export const sectionApprovalSchema = z
  .object({
    userId: idSchema,
    email: z.string(),
    displayName: z.string().nullable(),
    decision: approvalDecisionSchema,
    comment: z.string(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
export type SectionApprovalDto = z.infer<typeof sectionApprovalSchema>

export const reportSectionSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    title: z.string(),
    /// HTML-тело: сервер санитизирует белый список тегов при каждом сохранении.
    body: z.string(),
    sortOrder: z.number().int(),
    approvals: z.array(sectionApprovalSchema),
  })
  .strict()
export type ReportSectionDto = z.infer<typeof reportSectionSchema>

/// Сводка готовности: раздел согласован, если есть visa ok от клиента и нет visas changes.
export const reportReadinessSchema = z
  .object({
    sections: z.number().int(),
    agreed: z.number().int(),
    withIssues: z.number().int(),
    /// Клиентские роли, от которых ждём визы: сколько разделов каждому осталось.
    pending: z.array(
      z
        .object({
          userId: idSchema,
          displayName: z.string().nullable(),
          sections: z.number().int(),
        })
        .strict(),
    ),
  })
  .strict()
export type ReportReadiness = z.infer<typeof reportReadinessSchema>

export const projectReportSchema = z
  .object({
    sections: z.array(reportSectionSchema),
    readiness: reportReadinessSchema,
  })
  .strict()
export type ProjectReportDto = z.infer<typeof projectReportSchema>

export const createReportSectionRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    body: z.string().max(200_000).default(''),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type CreateReportSectionRequest = z.infer<typeof createReportSectionRequestSchema>

export const updateReportSectionRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    body: z.string().max(200_000).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type UpdateReportSectionRequest = z.infer<typeof updateReportSectionRequestSchema>

export const reportSectionParamsSchema = z
  .object({
    sectionId: uuidSchema,
  })
  .strict()

export const sectionApprovalRequestSchema = z
  .object({
    decision: approvalDecisionSchema,
    comment: z.string().trim().max(2000).default(''),
  })
  .strict()
export type SectionApprovalRequest = z.infer<typeof sectionApprovalRequestSchema>

// ============================================================
// Автовставки: сервер собирает HTML-таблицу и дописывает в конец body
// ============================================================

export const reportInsertKindSchema = z.enum(['findings', 'requests', 'coverage', 'registry', 'risks'])
export type ReportInsertKind = z.infer<typeof reportInsertKindSchema>

export const reportInsertRequestSchema = z
  .object({
    sectionId: uuidSchema,
    kind: reportInsertKindSchema,
    /// Для kind=findings: домен, чьи находки вставляем.
    domainId: uuidSchema.optional(),
    /// Для kind=registry: свой реестр проекта.
    registryId: uuidSchema.optional(),
  })
  .strict()
  .refine((value) => value.kind !== 'findings' || value.domainId !== undefined, {
    message: 'kind=findings requires domainId',
  })
  .refine((value) => value.kind !== 'registry' || value.registryId !== undefined, {
    message: 'kind=registry requires registryId',
  })
export type ReportInsertRequest = z.infer<typeof reportInsertRequestSchema>

export const reportInsertResponseSchema = z
  .object({
    section: reportSectionSchema,
  })
  .strict()
export type ReportInsertResponse = z.infer<typeof reportInsertResponseSchema>
