import {
  apiErrorSchema,
  createDataRequestRequestSchema,
  dataRequestParamsSchema,
  dataRequestsQuerySchema,
  dataRequestsResponseSchema,
  dataRequestSchema,
  projectParamsSchema,
  updateDataRequestRequestSchema,
  updateDataRequestStatusRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { RequestsService } from '../application/requests-service'
import { executeSurvey } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listRequestsRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/requests',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    query: dataRequestsQuerySchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: dataRequestsResponseSchema } },
      description: 'Data requests with on-the-fly overdue flags',
    },
    400: { content: errorContent, description: 'Invalid query' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createRequestRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/requests',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createDataRequestRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: dataRequestSchema } },
      description: 'Created data request',
    },
    400: { content: errorContent, description: 'Invalid payload or links outside this project' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can create requests' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const getRequestRoute = createRoute({
  method: 'get',
  path: '/requests/{requestId}',
  security: bearerSecurity,
  request: { params: dataRequestParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: dataRequestSchema } },
      description: 'Data request',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Request not found' },
  },
})

const updateRequestRoute = createRoute({
  method: 'patch',
  path: '/requests/{requestId}',
  security: bearerSecurity,
  request: {
    params: dataRequestParamsSchema,
    body: { content: { 'application/json': { schema: updateDataRequestRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: dataRequestSchema } },
      description: 'Updated request',
    },
    400: { content: errorContent, description: 'Invalid payload or links outside this project' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit requests' },
    404: { content: errorContent, description: 'Request not found' },
  },
})

const updateRequestStatusRoute = createRoute({
  method: 'patch',
  path: '/requests/{requestId}/status',
  security: bearerSecurity,
  request: {
    params: dataRequestParamsSchema,
    body: { content: { 'application/json': { schema: updateDataRequestStatusRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: dataRequestSchema } },
      description: 'Status updated; the client portal scenario (take in progress / received)',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team and client members can answer' },
    404: { content: errorContent, description: 'Request not found' },
  },
})

const deleteRequestRoute = createRoute({
  method: 'delete',
  path: '/requests/{requestId}',
  security: bearerSecurity,
  request: { params: dataRequestParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted request' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can delete requests' },
    404: { content: errorContent, description: 'Request not found' },
  },
})

type CreateRequestRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: RequestsService
}

/** Запросы данных; монтируются под /api. */
export function createRequestRoutes({ requireAuth, service }: CreateRequestRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/requests', requireAuth)
  routes.use('/requests/:requestId', requireAuth)
  routes.use('/requests/:requestId/status', requireAuth)

  routes.openapi(listRequestsRoute, async (c) => {
    const items = await executeSurvey(() =>
      service.listRequests(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createRequestRoute, async (c) => {
    const request = await executeSurvey(() =>
      service.createRequest(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(request, 201)
  })
  routes.openapi(getRequestRoute, async (c) => {
    const request = await executeSurvey(() =>
      service.getRequest(c.var.user, c.req.valid('param').requestId),
    )
    return c.json(request, 200)
  })
  routes.openapi(updateRequestRoute, async (c) => {
    const request = await executeSurvey(() =>
      service.updateRequest(c.var.user, c.req.valid('param').requestId, c.req.valid('json')),
    )
    return c.json(request, 200)
  })
  routes.openapi(updateRequestStatusRoute, async (c) => {
    const request = await executeSurvey(() =>
      service.updateStatus(c.var.user, c.req.valid('param').requestId, c.req.valid('json')),
    )
    return c.json(request, 200)
  })
  routes.openapi(deleteRequestRoute, async (c) => {
    await executeSurvey(() => service.deleteRequest(c.var.user, c.req.valid('param').requestId))
    return c.body(null, 204)
  })

  return routes
}
