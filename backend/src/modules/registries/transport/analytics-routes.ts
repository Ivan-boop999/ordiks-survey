import {
  apiErrorSchema,
  baselineParamsSchema,
  baselinesQuerySchema,
  baselinesResponseSchema,
  communicationParamsSchema,
  communicationsResponseSchema,
  createBaselineRequestSchema,
  createCommunicationRequestSchema,
  createDecisionRequestSchema,
  createGapRequestSchema,
  createQuickWinRequestSchema,
  createRequirementRequestSchema,
  createRiskRequestSchema,
  decisionParamsSchema,
  decisionsResponseSchema,
  gapParamsSchema,
  gapsQuerySchema,
  gapsResponseSchema,
  projectParamsSchema,
  quickWinParamsSchema,
  quickWinsQuerySchema,
  quickWinsResponseSchema,
  requirementParamsSchema,
  requirementsQuerySchema,
  requirementsResponseSchema,
  riskParamsSchema,
  risksQuerySchema,
  risksResponseSchema,
  updateBaselineRequestSchema,
  updateCommunicationRequestSchema,
  updateDecisionRequestSchema,
  updateGapRequestSchema,
  updateQuickWinRequestSchema,
  updateRequirementRequestSchema,
  updateRiskRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { AnalyticsService } from '../application/analytics-service'
import { executeRegistries } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const unauthorized = { 401: { content: errorContent, description: 'Authentication required' } }
const readForbidden = { 403: { content: errorContent, description: 'No access to this project' } }
const writeForbidden = {
  403: { content: errorContent, description: 'Only the Ordiks team can edit this registry' },
}
const invalidPayload = { 400: { content: errorContent, description: 'Invalid payload or cross-project link' } }

type CreateAnalyticsRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: AnalyticsService
}

/**
 * Аналитические реестры (GAP, риски, требования, решения, коммуникации, quick wins, базлайн).
 * Семь семейств с одинаковой формой «коллекция с фильтрами + CRUD элемента»; статусы ответов
 * общие, монтируются под /api.
 */
export function createAnalyticsRoutes({ requireAuth, service }: CreateAnalyticsRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  for (const path of [
    '/projects/:projectId/gaps',
    '/gaps/:gapId',
    '/projects/:projectId/risks',
    '/risks/:riskId',
    '/projects/:projectId/requirements',
    '/requirements/:requirementId',
    '/projects/:projectId/decisions',
    '/decisions/:decisionId',
    '/projects/:projectId/communications',
    '/communications/:communicationId',
    '/projects/:projectId/quick-wins',
    '/quick-wins/:quickWinId',
    '/projects/:projectId/baselines',
    '/baselines/:baselineId',
  ]) {
    routes.use(path, requireAuth)
  }

  // ---------------- GAP ----------------
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/projects/{projectId}/gaps',
      security: bearerSecurity,
      request: { params: projectParamsSchema, query: gapsQuerySchema },
      responses: {
        200: { content: { 'application/json': { schema: gapsResponseSchema } }, description: 'GAP items' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const items = await executeRegistries(() =>
        service.listGaps(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
      )
      return c.json({ items }, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'post',
      path: '/projects/{projectId}/gaps',
      security: bearerSecurity,
      request: {
        params: projectParamsSchema,
        body: { content: { 'application/json': { schema: createGapRequestSchema } } },
      },
      responses: {
        201: { content: { 'application/json': { schema: gapsResponseSchema.shape.items.element } }, description: 'Created GAP' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.createGap(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
      )
      return c.json(item, 201)
    },
  )
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/gaps/{gapId}',
      security: bearerSecurity,
      request: { params: gapParamsSchema },
      responses: {
        200: { content: { 'application/json': { schema: gapsResponseSchema.shape.items.element } }, description: 'GAP' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'GAP not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() => service.getGap(c.var.user, c.req.valid('param').gapId))
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'patch',
      path: '/gaps/{gapId}',
      security: bearerSecurity,
      request: {
        params: gapParamsSchema,
        body: { content: { 'application/json': { schema: updateGapRequestSchema } } },
      },
      responses: {
        200: { content: { 'application/json': { schema: gapsResponseSchema.shape.items.element } }, description: 'Updated GAP' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'GAP not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.updateGap(c.var.user, c.req.valid('param').gapId, c.req.valid('json')),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'delete',
      path: '/gaps/{gapId}',
      security: bearerSecurity,
      request: { params: gapParamsSchema },
      responses: {
        204: { description: 'Deleted GAP' },
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'GAP not found' },
      },
    }),
    async (c) => {
      await executeRegistries(() => service.deleteGap(c.var.user, c.req.valid('param').gapId))
      return c.body(null, 204)
    },
  )

  // ---------------- Риски ----------------
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/projects/{projectId}/risks',
      security: bearerSecurity,
      request: { params: projectParamsSchema, query: risksQuerySchema },
      responses: {
        200: { content: { 'application/json': { schema: risksResponseSchema } }, description: 'Risk items with computed criticality' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const items = await executeRegistries(() =>
        service.listRisks(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
      )
      return c.json({ items }, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'post',
      path: '/projects/{projectId}/risks',
      security: bearerSecurity,
      request: {
        params: projectParamsSchema,
        body: { content: { 'application/json': { schema: createRiskRequestSchema } } },
      },
      responses: {
        201: { content: { 'application/json': { schema: risksResponseSchema.shape.items.element } }, description: 'Created risk' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.createRisk(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
      )
      return c.json(item, 201)
    },
  )
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/risks/{riskId}',
      security: bearerSecurity,
      request: { params: riskParamsSchema },
      responses: {
        200: { content: { 'application/json': { schema: risksResponseSchema.shape.items.element } }, description: 'Risk' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Risk not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() => service.getRisk(c.var.user, c.req.valid('param').riskId))
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'patch',
      path: '/risks/{riskId}',
      security: bearerSecurity,
      request: {
        params: riskParamsSchema,
        body: { content: { 'application/json': { schema: updateRiskRequestSchema } } },
      },
      responses: {
        200: { content: { 'application/json': { schema: risksResponseSchema.shape.items.element } }, description: 'Updated risk' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Risk not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.updateRisk(c.var.user, c.req.valid('param').riskId, c.req.valid('json')),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'delete',
      path: '/risks/{riskId}',
      security: bearerSecurity,
      request: { params: riskParamsSchema },
      responses: {
        204: { description: 'Deleted risk' },
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Risk not found' },
      },
    }),
    async (c) => {
      await executeRegistries(() => service.deleteRisk(c.var.user, c.req.valid('param').riskId))
      return c.body(null, 204)
    },
  )

  // ---------------- Требования ----------------
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/projects/{projectId}/requirements',
      security: bearerSecurity,
      request: { params: projectParamsSchema, query: requirementsQuerySchema },
      responses: {
        200: { content: { 'application/json': { schema: requirementsResponseSchema } }, description: 'Requirement items' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const items = await executeRegistries(() =>
        service.listRequirements(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
      )
      return c.json({ items }, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'post',
      path: '/projects/{projectId}/requirements',
      security: bearerSecurity,
      request: {
        params: projectParamsSchema,
        body: { content: { 'application/json': { schema: createRequirementRequestSchema } } },
      },
      responses: {
        201: { content: { 'application/json': { schema: requirementsResponseSchema.shape.items.element } }, description: 'Created requirement' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.createRequirement(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
      )
      return c.json(item, 201)
    },
  )
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/requirements/{requirementId}',
      security: bearerSecurity,
      request: { params: requirementParamsSchema },
      responses: {
        200: { content: { 'application/json': { schema: requirementsResponseSchema.shape.items.element } }, description: 'Requirement' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Requirement not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.getRequirement(c.var.user, c.req.valid('param').requirementId),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'patch',
      path: '/requirements/{requirementId}',
      security: bearerSecurity,
      request: {
        params: requirementParamsSchema,
        body: { content: { 'application/json': { schema: updateRequirementRequestSchema } } },
      },
      responses: {
        200: { content: { 'application/json': { schema: requirementsResponseSchema.shape.items.element } }, description: 'Updated requirement' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Requirement not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.updateRequirement(c.var.user, c.req.valid('param').requirementId, c.req.valid('json')),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'delete',
      path: '/requirements/{requirementId}',
      security: bearerSecurity,
      request: { params: requirementParamsSchema },
      responses: {
        204: { description: 'Deleted requirement' },
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Requirement not found' },
      },
    }),
    async (c) => {
      await executeRegistries(() =>
        service.deleteRequirement(c.var.user, c.req.valid('param').requirementId),
      )
      return c.body(null, 204)
    },
  )

  // ---------------- Решения ----------------
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/projects/{projectId}/decisions',
      security: bearerSecurity,
      request: { params: projectParamsSchema },
      responses: {
        200: { content: { 'application/json': { schema: decisionsResponseSchema } }, description: 'Decision log items' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const items = await executeRegistries(() =>
        service.listDecisions(c.var.user, c.req.valid('param').projectId),
      )
      return c.json({ items }, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'post',
      path: '/projects/{projectId}/decisions',
      security: bearerSecurity,
      request: {
        params: projectParamsSchema,
        body: { content: { 'application/json': { schema: createDecisionRequestSchema } } },
      },
      responses: {
        201: { content: { 'application/json': { schema: decisionsResponseSchema.shape.items.element } }, description: 'Created decision' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.createDecision(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
      )
      return c.json(item, 201)
    },
  )
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/decisions/{decisionId}',
      security: bearerSecurity,
      request: { params: decisionParamsSchema },
      responses: {
        200: { content: { 'application/json': { schema: decisionsResponseSchema.shape.items.element } }, description: 'Decision' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Decision not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.getDecision(c.var.user, c.req.valid('param').decisionId),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'patch',
      path: '/decisions/{decisionId}',
      security: bearerSecurity,
      request: {
        params: decisionParamsSchema,
        body: { content: { 'application/json': { schema: updateDecisionRequestSchema } } },
      },
      responses: {
        200: { content: { 'application/json': { schema: decisionsResponseSchema.shape.items.element } }, description: 'Updated decision' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Decision not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.updateDecision(c.var.user, c.req.valid('param').decisionId, c.req.valid('json')),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'delete',
      path: '/decisions/{decisionId}',
      security: bearerSecurity,
      request: { params: decisionParamsSchema },
      responses: {
        204: { description: 'Deleted decision' },
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Decision not found' },
      },
    }),
    async (c) => {
      await executeRegistries(() =>
        service.deleteDecision(c.var.user, c.req.valid('param').decisionId),
      )
      return c.body(null, 204)
    },
  )

  // ---------------- Коммуникации ----------------
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/projects/{projectId}/communications',
      security: bearerSecurity,
      request: { params: projectParamsSchema },
      responses: {
        200: { content: { 'application/json': { schema: communicationsResponseSchema } }, description: 'Communication items' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const items = await executeRegistries(() =>
        service.listCommunications(c.var.user, c.req.valid('param').projectId),
      )
      return c.json({ items }, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'post',
      path: '/projects/{projectId}/communications',
      security: bearerSecurity,
      request: {
        params: projectParamsSchema,
        body: { content: { 'application/json': { schema: createCommunicationRequestSchema } } },
      },
      responses: {
        201: { content: { 'application/json': { schema: communicationsResponseSchema.shape.items.element } }, description: 'Created communication' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.createCommunication(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
      )
      return c.json(item, 201)
    },
  )
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/communications/{communicationId}',
      security: bearerSecurity,
      request: { params: communicationParamsSchema },
      responses: {
        200: { content: { 'application/json': { schema: communicationsResponseSchema.shape.items.element } }, description: 'Communication' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Communication not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.getCommunication(c.var.user, c.req.valid('param').communicationId),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'patch',
      path: '/communications/{communicationId}',
      security: bearerSecurity,
      request: {
        params: communicationParamsSchema,
        body: { content: { 'application/json': { schema: updateCommunicationRequestSchema } } },
      },
      responses: {
        200: { content: { 'application/json': { schema: communicationsResponseSchema.shape.items.element } }, description: 'Updated communication' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Communication not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.updateCommunication(c.var.user, c.req.valid('param').communicationId, c.req.valid('json')),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'delete',
      path: '/communications/{communicationId}',
      security: bearerSecurity,
      request: { params: communicationParamsSchema },
      responses: {
        204: { description: 'Deleted communication' },
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Communication not found' },
      },
    }),
    async (c) => {
      await executeRegistries(() =>
        service.deleteCommunication(c.var.user, c.req.valid('param').communicationId),
      )
      return c.body(null, 204)
    },
  )

  // ---------------- Quick wins ----------------
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/projects/{projectId}/quick-wins',
      security: bearerSecurity,
      request: { params: projectParamsSchema, query: quickWinsQuerySchema },
      responses: {
        200: { content: { 'application/json': { schema: quickWinsResponseSchema } }, description: 'Quick win items' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const items = await executeRegistries(() =>
        service.listQuickWins(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
      )
      return c.json({ items }, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'post',
      path: '/projects/{projectId}/quick-wins',
      security: bearerSecurity,
      request: {
        params: projectParamsSchema,
        body: { content: { 'application/json': { schema: createQuickWinRequestSchema } } },
      },
      responses: {
        201: { content: { 'application/json': { schema: quickWinsResponseSchema.shape.items.element } }, description: 'Created quick win' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.createQuickWin(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
      )
      return c.json(item, 201)
    },
  )
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/quick-wins/{quickWinId}',
      security: bearerSecurity,
      request: { params: quickWinParamsSchema },
      responses: {
        200: { content: { 'application/json': { schema: quickWinsResponseSchema.shape.items.element } }, description: 'Quick win' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Quick win not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.getQuickWin(c.var.user, c.req.valid('param').quickWinId),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'patch',
      path: '/quick-wins/{quickWinId}',
      security: bearerSecurity,
      request: {
        params: quickWinParamsSchema,
        body: { content: { 'application/json': { schema: updateQuickWinRequestSchema } } },
      },
      responses: {
        200: { content: { 'application/json': { schema: quickWinsResponseSchema.shape.items.element } }, description: 'Updated quick win' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Quick win not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.updateQuickWin(c.var.user, c.req.valid('param').quickWinId, c.req.valid('json')),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'delete',
      path: '/quick-wins/{quickWinId}',
      security: bearerSecurity,
      request: { params: quickWinParamsSchema },
      responses: {
        204: { description: 'Deleted quick win' },
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Quick win not found' },
      },
    }),
    async (c) => {
      await executeRegistries(() =>
        service.deleteQuickWin(c.var.user, c.req.valid('param').quickWinId),
      )
      return c.body(null, 204)
    },
  )

  // ---------------- Базлайн ----------------
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/projects/{projectId}/baselines',
      security: bearerSecurity,
      request: { params: projectParamsSchema, query: baselinesQuerySchema },
      responses: {
        200: { content: { 'application/json': { schema: baselinesResponseSchema } }, description: 'Baseline items' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const items = await executeRegistries(() =>
        service.listBaselines(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
      )
      return c.json({ items }, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'post',
      path: '/projects/{projectId}/baselines',
      security: bearerSecurity,
      request: {
        params: projectParamsSchema,
        body: { content: { 'application/json': { schema: createBaselineRequestSchema } } },
      },
      responses: {
        201: { content: { 'application/json': { schema: baselinesResponseSchema.shape.items.element } }, description: 'Created baseline' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Project not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.createBaseline(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
      )
      return c.json(item, 201)
    },
  )
  routes.openapi(
    createRoute({
      method: 'get',
      path: '/baselines/{baselineId}',
      security: bearerSecurity,
      request: { params: baselineParamsSchema },
      responses: {
        200: { content: { 'application/json': { schema: baselinesResponseSchema.shape.items.element } }, description: 'Baseline' },
        ...unauthorized,
        ...readForbidden,
        404: { content: errorContent, description: 'Baseline not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.getBaseline(c.var.user, c.req.valid('param').baselineId),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'patch',
      path: '/baselines/{baselineId}',
      security: bearerSecurity,
      request: {
        params: baselineParamsSchema,
        body: { content: { 'application/json': { schema: updateBaselineRequestSchema } } },
      },
      responses: {
        200: { content: { 'application/json': { schema: baselinesResponseSchema.shape.items.element } }, description: 'Updated baseline' },
        ...invalidPayload,
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Baseline not found' },
      },
    }),
    async (c) => {
      const item = await executeRegistries(() =>
        service.updateBaseline(c.var.user, c.req.valid('param').baselineId, c.req.valid('json')),
      )
      return c.json(item, 200)
    },
  )
  routes.openapi(
    createRoute({
      method: 'delete',
      path: '/baselines/{baselineId}',
      security: bearerSecurity,
      request: { params: baselineParamsSchema },
      responses: {
        204: { description: 'Deleted baseline' },
        ...unauthorized,
        ...writeForbidden,
        404: { content: errorContent, description: 'Baseline not found' },
      },
    }),
    async (c) => {
      await executeRegistries(() =>
        service.deleteBaseline(c.var.user, c.req.valid('param').baselineId),
      )
      return c.body(null, 204)
    },
  )

  return routes
}
