import { z } from 'zod'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()

// ============================================================
// GAP-реестр (разрывы между требованием и реальностью)
// ============================================================

export const gapKindSchema = z.enum(['std', 'dev', 'manual'])
export type GapKind = z.infer<typeof gapKindSchema>

export const gapStatusSchema = z.enum(['open', 'agreed', 'rejected'])
export type GapStatus = z.infer<typeof gapStatusSchema>

export const gapSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    domainId: z.string().nullable(),
    findingId: z.string().nullable(),
    requirement: z.string(),
    kind: gapKindSchema,
    status: gapStatusSchema,
    comment: z.string(),
    createdAt: isoDateTime,
  })
  .strict()
export type GapDto = z.infer<typeof gapSchema>

export const gapsResponseSchema = z.object({ items: z.array(gapSchema) }).strict()

export const gapsQuerySchema = z
  .object({
    domainId: uuidSchema.optional(),
    status: gapStatusSchema.optional(),
  })
  .strict()
export type GapsQuery = z.infer<typeof gapsQuerySchema>

const gapCoreSchema = {
  requirement: z.string().trim().min(1).max(1000),
  kind: gapKindSchema.optional(),
  status: gapStatusSchema.optional(),
  comment: z.string().max(2000).default(''),
  domainId: uuidSchema.nullish(),
  findingId: uuidSchema.nullish(),
}

export const createGapRequestSchema = z.object(gapCoreSchema).strict()
export type CreateGapRequest = z.infer<typeof createGapRequestSchema>

export const updateGapRequestSchema = z
  .object({
    ...gapCoreSchema,
    requirement: z.string().trim().min(1).max(1000).optional(),
    comment: z.string().max(2000).optional(),
  })
  .strict()
export type UpdateGapRequest = z.infer<typeof updateGapRequestSchema>

export const gapParamsSchema = z.object({ gapId: uuidSchema }).strict()

// ============================================================
// Реестр рисков
// ============================================================

export const riskStatusSchema = z.enum(['open', 'mitigated', 'closed'])
export type RiskStatus = z.infer<typeof riskStatusSchema>

export const riskSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    domainId: z.string().nullable(),
    ownerId: z.string().nullable(),
    title: z.string(),
    probability: z.number().int().min(1).max(5),
    impact: z.number().int().min(1).max(5),
    /// Критичность = вероятность × влияние (1..25); вычисляется в DTO, не хранится.
    criticality: z.number().int().min(1).max(25),
    status: riskStatusSchema,
    mitigation: z.string(),
    createdAt: isoDateTime,
  })
  .strict()
export type RiskDto = z.infer<typeof riskSchema>

export const risksResponseSchema = z.object({ items: z.array(riskSchema) }).strict()

export const risksQuerySchema = z
  .object({
    domainId: uuidSchema.optional(),
    status: riskStatusSchema.optional(),
  })
  .strict()
export type RisksQuery = z.infer<typeof risksQuerySchema>

const riskCoreSchema = {
  title: z.string().trim().min(1).max(300),
  probability: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  status: riskStatusSchema.optional(),
  mitigation: z.string().max(2000).default(''),
  domainId: uuidSchema.nullish(),
  ownerId: uuidSchema.nullish(),
}

export const createRiskRequestSchema = z.object(riskCoreSchema).strict()
export type CreateRiskRequest = z.infer<typeof createRiskRequestSchema>

export const updateRiskRequestSchema = z
  .object({
    ...riskCoreSchema,
    title: z.string().trim().min(1).max(300).optional(),
    mitigation: z.string().max(2000).optional(),
  })
  .strict()
export type UpdateRiskRequest = z.infer<typeof updateRiskRequestSchema>

export const riskParamsSchema = z.object({ riskId: uuidSchema }).strict()

// ============================================================
// Требования (MoSCoW)
// ============================================================

export const moscowPrioritySchema = z.enum(['must', 'should', 'could', 'wont'])
export type MoscowPriority = z.infer<typeof moscowPrioritySchema>

export const requirementSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    domainId: z.string().nullable(),
    findingId: z.string().nullable(),
    title: z.string(),
    source: z.string(),
    moscow: moscowPrioritySchema,
    createdAt: isoDateTime,
  })
  .strict()
export type RequirementDto = z.infer<typeof requirementSchema>

export const requirementsResponseSchema = z.object({ items: z.array(requirementSchema) }).strict()

export const requirementsQuerySchema = z
  .object({
    domainId: uuidSchema.optional(),
    moscow: moscowPrioritySchema.optional(),
  })
  .strict()
export type RequirementsQuery = z.infer<typeof requirementsQuerySchema>

const requirementCoreSchema = {
  title: z.string().trim().min(1).max(1000),
  source: z.string().trim().max(200).default(''),
  moscow: moscowPrioritySchema.optional(),
  domainId: uuidSchema.nullish(),
  findingId: uuidSchema.nullish(),
}

export const createRequirementRequestSchema = z.object(requirementCoreSchema).strict()
export type CreateRequirementRequest = z.infer<typeof createRequirementRequestSchema>

export const updateRequirementRequestSchema = z
  .object({
    ...requirementCoreSchema,
    title: z.string().trim().min(1).max(1000).optional(),
    source: z.string().trim().max(200).optional(),
  })
  .strict()
export type UpdateRequirementRequest = z.infer<typeof updateRequirementRequestSchema>

export const requirementParamsSchema = z.object({ requirementId: uuidSchema }).strict()

// ============================================================
// Журнал решений
// ============================================================

export const decisionStatusSchema = z.enum(['active', 'superseded'])
export type DecisionStatus = z.infer<typeof decisionStatusSchema>

export const decisionSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    title: z.string(),
    rationale: z.string(),
    participants: z.string(),
    status: decisionStatusSchema,
    decidedAt: isoDateTime,
    createdAt: isoDateTime,
  })
  .strict()
export type DecisionDto = z.infer<typeof decisionSchema>

export const decisionsResponseSchema = z.object({ items: z.array(decisionSchema) }).strict()

const decisionCoreSchema = {
  title: z.string().trim().min(1).max(500),
  rationale: z.string().max(4000).default(''),
  participants: z.string().max(500).default(''),
  status: decisionStatusSchema.optional(),
  decidedAt: z.coerce.date().optional(),
}

export const createDecisionRequestSchema = z.object(decisionCoreSchema).strict()
export type CreateDecisionRequest = z.infer<typeof createDecisionRequestSchema>

export const updateDecisionRequestSchema = z
  .object({
    ...decisionCoreSchema,
    title: z.string().trim().min(1).max(500).optional(),
    rationale: z.string().max(4000).optional(),
    participants: z.string().max(500).optional(),
  })
  .strict()
export type UpdateDecisionRequest = z.infer<typeof updateDecisionRequestSchema>

export const decisionParamsSchema = z.object({ decisionId: uuidSchema }).strict()

// ============================================================
// Журнал коммуникаций
// ============================================================

export const communicationKindSchema = z.enum(['meeting', 'call', 'email'])
export type CommunicationKind = z.infer<typeof communicationKindSchema>

export const communicationSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    title: z.string(),
    kind: communicationKindSchema,
    participants: z.string(),
    summary: z.string(),
    heldAt: isoDateTime,
    createdAt: isoDateTime,
  })
  .strict()
export type CommunicationDto = z.infer<typeof communicationSchema>

export const communicationsResponseSchema = z.object({ items: z.array(communicationSchema) }).strict()

const communicationCoreSchema = {
  title: z.string().trim().min(1).max(300),
  kind: communicationKindSchema.optional(),
  participants: z.string().max(500).default(''),
  summary: z.string().max(4000).default(''),
  heldAt: z.coerce.date().optional(),
}

export const createCommunicationRequestSchema = z.object(communicationCoreSchema).strict()
export type CreateCommunicationRequest = z.infer<typeof createCommunicationRequestSchema>

export const updateCommunicationRequestSchema = z
  .object({
    ...communicationCoreSchema,
    title: z.string().trim().min(1).max(300).optional(),
    participants: z.string().max(500).optional(),
    summary: z.string().max(4000).optional(),
  })
  .strict()
export type UpdateCommunicationRequest = z.infer<typeof updateCommunicationRequestSchema>

export const communicationParamsSchema = z.object({ communicationId: uuidSchema }).strict()

// ============================================================
// Быстрые улучшения
// ============================================================

export const quickWinStatusSchema = z.enum(['suggested', 'accepted', 'done'])
export type QuickWinStatus = z.infer<typeof quickWinStatusSchema>

export const quickWinSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    domainId: z.string().nullable(),
    title: z.string(),
    effect: z.string(),
    effort: z.string(),
    status: quickWinStatusSchema,
    createdAt: isoDateTime,
  })
  .strict()
export type QuickWinDto = z.infer<typeof quickWinSchema>

export const quickWinsResponseSchema = z.object({ items: z.array(quickWinSchema) }).strict()

export const quickWinsQuerySchema = z
  .object({
    domainId: uuidSchema.optional(),
    status: quickWinStatusSchema.optional(),
  })
  .strict()
export type QuickWinsQuery = z.infer<typeof quickWinsQuerySchema>

const quickWinCoreSchema = {
  title: z.string().trim().min(1).max(500),
  effect: z.string().max(2000).default(''),
  effort: z.string().trim().max(80).default('средний'),
  status: quickWinStatusSchema.optional(),
  domainId: uuidSchema.nullish(),
}

export const createQuickWinRequestSchema = z.object(quickWinCoreSchema).strict()
export type CreateQuickWinRequest = z.infer<typeof createQuickWinRequestSchema>

export const updateQuickWinRequestSchema = z
  .object({
    ...quickWinCoreSchema,
    title: z.string().trim().min(1).max(500).optional(),
    effect: z.string().max(2000).optional(),
    effort: z.string().trim().max(80).optional(),
  })
  .strict()
export type UpdateQuickWinRequest = z.infer<typeof updateQuickWinRequestSchema>

export const quickWinParamsSchema = z.object({ quickWinId: uuidSchema }).strict()

// ============================================================
// Базлайн (метрики «как есть»)
// ============================================================

export const baselineSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    domainId: z.string().nullable(),
    metric: z.string(),
    value: z.string(),
    unit: z.string(),
    comment: z.string(),
    source: z.string(),
    createdAt: isoDateTime,
  })
  .strict()
export type BaselineDto = z.infer<typeof baselineSchema>

export const baselinesResponseSchema = z.object({ items: z.array(baselineSchema) }).strict()

export const baselinesQuerySchema = z
  .object({
    domainId: uuidSchema.optional(),
  })
  .strict()
export type BaselinesQuery = z.infer<typeof baselinesQuerySchema>

const baselineCoreSchema = {
  metric: z.string().trim().min(1).max(300),
  value: z.string().trim().max(200),
  unit: z.string().trim().max(120).default(''),
  comment: z.string().max(2000).default(''),
  source: z.string().trim().max(200).default(''),
  domainId: uuidSchema.nullish(),
}

export const createBaselineRequestSchema = z.object(baselineCoreSchema).strict()
export type CreateBaselineRequest = z.infer<typeof createBaselineRequestSchema>

export const updateBaselineRequestSchema = z
  .object({
    ...baselineCoreSchema,
    metric: z.string().trim().min(1).max(300).optional(),
    value: z.string().trim().max(200).optional(),
    unit: z.string().trim().max(120).optional(),
    comment: z.string().max(2000).optional(),
    source: z.string().trim().max(200).optional(),
  })
  .strict()
export type UpdateBaselineRequest = z.infer<typeof updateBaselineRequestSchema>

export const baselineParamsSchema = z.object({ baselineId: uuidSchema }).strict()
