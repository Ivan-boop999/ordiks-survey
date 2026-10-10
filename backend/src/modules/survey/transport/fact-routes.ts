import {
  apiErrorSchema,
  confirmFactUploadRequestSchema,
  createFactRequestSchema,
  createFactUploadRequestSchema,
  createFactUploadResponseSchema,
  factFileDownloadSchema,
  factParamsSchema,
  factsQuerySchema,
  factsResponseSchema,
  factSchema,
  projectParamsSchema,
  updateFactRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { FactsService } from '../application/facts-service'
import { executeSurvey } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listFactsRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/facts',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    query: factsQuerySchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: factsResponseSchema } },
      description: 'Facts filtered by domain, shop, kind, type, and author, with title+description search',
    },
    400: { content: errorContent, description: 'Invalid query' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createFactRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/facts',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createFactRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: factSchema } },
      description: 'Created fact',
    },
    400: { content: errorContent, description: 'Invalid payload or dictionary value' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can add facts' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const getFactRoute = createRoute({
  method: 'get',
  path: '/facts/{factId}',
  security: bearerSecurity,
  request: {
    params: factParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: factSchema } },
      description: 'Fact with linked findings',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Fact not found' },
  },
})

const updateFactRoute = createRoute({
  method: 'patch',
  path: '/facts/{factId}',
  security: bearerSecurity,
  request: {
    params: factParamsSchema,
    body: { content: { 'application/json': { schema: updateFactRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: factSchema } },
      description: 'Updated fact',
    },
    400: { content: errorContent, description: 'Invalid payload or dictionary value' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit facts' },
    404: { content: errorContent, description: 'Fact not found' },
  },
})

const deleteFactRoute = createRoute({
  method: 'delete',
  path: '/facts/{factId}',
  security: bearerSecurity,
  request: {
    params: factParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted fact and its stored file' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can delete facts' },
    404: { content: errorContent, description: 'Fact not found' },
  },
})

const createFactUploadRoute = createRoute({
  method: 'post',
  path: '/facts/{factId}/file/upload-request',
  security: bearerSecurity,
  request: {
    params: factParamsSchema,
    body: { content: { 'application/json': { schema: createFactUploadRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: createFactUploadResponseSchema } },
      description: 'Presigned upload ticket for the fact file (projects/{projectId}/facts/{uuid})',
    },
    400: { content: errorContent, description: 'Invalid payload or storage limit' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can upload fact files' },
    404: { content: errorContent, description: 'Fact not found' },
  },
})

const confirmFactUploadRoute = createRoute({
  method: 'post',
  path: '/facts/{factId}/file/confirm',
  security: bearerSecurity,
  request: {
    params: factParamsSchema,
    body: { content: { 'application/json': { schema: confirmFactUploadRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: factSchema } },
      description: 'The fact, now pointing at the stored file',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can attach fact files' },
    404: { content: errorContent, description: 'Fact not found' },
    409: { content: errorContent, description: 'Upload incomplete or rejected' },
    410: { content: errorContent, description: 'Upload window expired' },
  },
})

const downloadFactFileRoute = createRoute({
  method: 'get',
  path: '/facts/{factId}/file/download',
  security: bearerSecurity,
  request: {
    params: factParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: factFileDownloadSchema } },
      description: 'Signed private download URL for every project role',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Fact not found or has no file' },
  },
})

const deleteFactFileRoute = createRoute({
  method: 'delete',
  path: '/facts/{factId}/file',
  security: bearerSecurity,
  request: {
    params: factParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: factSchema } },
      description: 'The fact without a file',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can delete fact files' },
    404: { content: errorContent, description: 'Fact not found' },
  },
})

type CreateFactRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: FactsService
}

/** Факты и их файлы; монтируются под /api. */
export function createFactRoutes({ requireAuth, service }: CreateFactRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/facts', requireAuth)
  routes.use('/facts/:factId', requireAuth)
  routes.use('/facts/:factId/file', requireAuth)
  routes.use('/facts/:factId/file/*', requireAuth)

  routes.openapi(listFactsRoute, async (c) => {
    const items = await executeSurvey(() =>
      service.listFacts(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createFactRoute, async (c) => {
    const fact = await executeSurvey(() =>
      service.createFact(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(fact, 201)
  })
  routes.openapi(getFactRoute, async (c) => {
    const fact = await executeSurvey(() => service.getFact(c.var.user, c.req.valid('param').factId))
    return c.json(fact, 200)
  })
  routes.openapi(updateFactRoute, async (c) => {
    const fact = await executeSurvey(() =>
      service.updateFact(c.var.user, c.req.valid('param').factId, c.req.valid('json')),
    )
    return c.json(fact, 200)
  })
  routes.openapi(deleteFactRoute, async (c) => {
    await executeSurvey(() => service.deleteFact(c.var.user, c.req.valid('param').factId))
    return c.body(null, 204)
  })
  routes.openapi(createFactUploadRoute, async (c) => {
    const result = await executeSurvey(() =>
      service.createUploadRequest(c.var.user, c.req.valid('param').factId, c.req.valid('json')),
    )
    return c.json(result, 201)
  })
  routes.openapi(confirmFactUploadRoute, async (c) => {
    const fact = await executeSurvey(() =>
      service.confirmUpload(c.var.user, c.req.valid('param').factId, c.req.valid('json')),
    )
    return c.json(fact, 200)
  })
  routes.openapi(downloadFactFileRoute, async (c) => {
    const download = await executeSurvey(() =>
      service.createDownloadUrl(c.var.user, c.req.valid('param').factId),
    )
    return c.json(download, 200)
  })
  routes.openapi(deleteFactFileRoute, async (c) => {
    const fact = await executeSurvey(() => service.deleteFile(c.var.user, c.req.valid('param').factId))
    return c.json(fact, 200)
  })

  return routes
}
