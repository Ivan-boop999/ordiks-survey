import {
  apiErrorSchema,
  bulkUpdateFindingsRequestSchema,
  bulkUpdateFindingsResponseSchema,
  createFindingRequestSchema,
  findingParamsSchema,
  findingsQuerySchema,
  findingsResponseSchema,
  findingSchema,
  projectParamsSchema,
  updateFindingRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { FindingsService } from '../application/findings-service'
import { executeSurvey } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listFindingsRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/findings',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    query: findingsQuerySchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: findingsResponseSchema } },
      description: 'Findings filtered by domain, priority, and status',
    },
    400: { content: errorContent, description: 'Invalid query' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createFindingRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/findings',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createFindingRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: findingSchema } },
      description: 'Created finding',
    },
    400: { content: errorContent, description: 'Invalid payload or dictionary value' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can register findings' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const bulkUpdateFindingsRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/findings/bulk',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: bulkUpdateFindingsRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: bulkUpdateFindingsResponseSchema } },
      description: 'How many findings moved to the new status',
    },
    400: { content: errorContent, description: 'Invalid payload or status not in the dictionary' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can bulk-update findings' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const getFindingRoute = createRoute({
  method: 'get',
  path: '/findings/{findingId}',
  security: bearerSecurity,
  request: { params: findingParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: findingSchema } },
      description: 'Finding',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Finding not found' },
  },
})

const updateFindingRoute = createRoute({
  method: 'patch',
  path: '/findings/{findingId}',
  security: bearerSecurity,
  request: {
    params: findingParamsSchema,
    body: { content: { 'application/json': { schema: updateFindingRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: findingSchema } },
      description: 'Updated finding',
    },
    400: { content: errorContent, description: 'Invalid payload or dictionary value' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit findings' },
    404: { content: errorContent, description: 'Finding not found' },
  },
})

const deleteFindingRoute = createRoute({
  method: 'delete',
  path: '/findings/{findingId}',
  security: bearerSecurity,
  request: { params: findingParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted finding' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can delete findings' },
    404: { content: errorContent, description: 'Finding not found' },
  },
})

type CreateFindingRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: FindingsService
}

/** Находки; монтируются под /api. */
export function createFindingRoutes({ requireAuth, service }: CreateFindingRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/findings', requireAuth)
  routes.use('/projects/:projectId/findings/bulk', requireAuth)
  routes.use('/findings/:findingId', requireAuth)

  routes.openapi(listFindingsRoute, async (c) => {
    const items = await executeSurvey(() =>
      service.listFindings(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createFindingRoute, async (c) => {
    const finding = await executeSurvey(() =>
      service.createFinding(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(finding, 201)
  })
  routes.openapi(bulkUpdateFindingsRoute, async (c) => {
    const result = await executeSurvey(() =>
      service.bulkUpdateStatus(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(result, 200)
  })
  routes.openapi(getFindingRoute, async (c) => {
    const finding = await executeSurvey(() =>
      service.getFinding(c.var.user, c.req.valid('param').findingId),
    )
    return c.json(finding, 200)
  })
  routes.openapi(updateFindingRoute, async (c) => {
    const finding = await executeSurvey(() =>
      service.updateFinding(c.var.user, c.req.valid('param').findingId, c.req.valid('json')),
    )
    return c.json(finding, 200)
  })
  routes.openapi(deleteFindingRoute, async (c) => {
    await executeSurvey(() => service.deleteFinding(c.var.user, c.req.valid('param').findingId))
    return c.body(null, 204)
  })

  return routes
}
