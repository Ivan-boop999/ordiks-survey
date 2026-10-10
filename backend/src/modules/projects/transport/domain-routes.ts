import {
  apiErrorSchema,
  checklistItemParamsSchema,
  checklistItemSchema,
  createChecklistItemRequestSchema,
  createDomainGroupRequestSchema,
  createDomainRequestSchema,
  domainGroupParamsSchema,
  domainGroupSchema,
  domainGroupsResponseSchema,
  domainParamsSchema,
  domainSchema,
  projectParamsSchema,
  updateChecklistItemRequestSchema,
  updateDomainGroupRequestSchema,
  updateDomainRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { DomainsService } from '../application/domains-service'
import { executeProjects } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listDomainGroupsRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/domain-groups',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: domainGroupsResponseSchema } },
      description: 'Domain groups with domains and coverage checklists',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createDomainGroupRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/domain-groups',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createDomainGroupRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: domainGroupSchema } },
      description: 'Created domain group',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const updateDomainGroupRoute = createRoute({
  method: 'patch',
  path: '/domain-groups/{groupId}',
  security: bearerSecurity,
  request: {
    params: domainGroupParamsSchema,
    body: { content: { 'application/json': { schema: updateDomainGroupRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: domainGroupSchema } },
      description: 'Updated domain group',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Domain group not found' },
  },
})

const deleteDomainGroupRoute = createRoute({
  method: 'delete',
  path: '/domain-groups/{groupId}',
  security: bearerSecurity,
  request: {
    params: domainGroupParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted domain group with its domains' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Domain group not found' },
  },
})

const createDomainRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/domains',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createDomainRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: domainSchema } },
      description: 'Created domain with its checklist',
    },
    400: { content: errorContent, description: 'Invalid payload or group outside this project' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const updateDomainRoute = createRoute({
  method: 'patch',
  path: '/domains/{domainId}',
  security: bearerSecurity,
  request: {
    params: domainParamsSchema,
    body: { content: { 'application/json': { schema: updateDomainRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: domainSchema } },
      description: 'Updated domain',
    },
    400: { content: errorContent, description: 'Invalid payload or group outside this project' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Domain not found' },
  },
})

const deleteDomainRoute = createRoute({
  method: 'delete',
  path: '/domains/{domainId}',
  security: bearerSecurity,
  request: {
    params: domainParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted domain with its checklist' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Domain not found' },
  },
})

const createChecklistItemRoute = createRoute({
  method: 'post',
  path: '/domains/{domainId}/checklist',
  security: bearerSecurity,
  request: {
    params: domainParamsSchema,
    body: { content: { 'application/json': { schema: createChecklistItemRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: checklistItemSchema } },
      description: 'Added checklist item; the domain status is recomputed',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Domain not found' },
  },
})

const updateChecklistItemRoute = createRoute({
  method: 'patch',
  path: '/checklist-items/{itemId}',
  security: bearerSecurity,
  request: {
    params: checklistItemParamsSchema,
    body: { content: { 'application/json': { schema: updateChecklistItemRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: checklistItemSchema } },
      description: 'Updated checklist item; the domain status is recomputed',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Checklist item not found' },
  },
})

const deleteChecklistItemRoute = createRoute({
  method: 'delete',
  path: '/checklist-items/{itemId}',
  security: bearerSecurity,
  request: {
    params: checklistItemParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted checklist item; the domain status is recomputed' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Checklist item not found' },
  },
})

type CreateDomainRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: DomainsService
}

/** Группы направлений, домены и чек-листы; монтируются под /api. */
export function createDomainRoutes({ requireAuth, service }: CreateDomainRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/domain-groups', requireAuth)
  routes.use('/projects/:projectId/domains', requireAuth)
  routes.use('/domain-groups/:groupId', requireAuth)
  routes.use('/domains/:domainId', requireAuth)
  routes.use('/domains/:domainId/checklist', requireAuth)
  routes.use('/checklist-items/:itemId', requireAuth)

  routes.openapi(listDomainGroupsRoute, async (c) => {
    const items = await executeProjects(() =>
      service.listDomainTree(c.var.user, c.req.valid('param').projectId),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createDomainGroupRoute, async (c) => {
    const group = await executeProjects(() =>
      service.createDomainGroup(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(group, 201)
  })
  routes.openapi(updateDomainGroupRoute, async (c) => {
    const group = await executeProjects(() =>
      service.updateDomainGroup(c.var.user, c.req.valid('param').groupId, c.req.valid('json')),
    )
    return c.json(group, 200)
  })
  routes.openapi(deleteDomainGroupRoute, async (c) => {
    await executeProjects(() =>
      service.deleteDomainGroup(c.var.user, c.req.valid('param').groupId),
    )
    return c.body(null, 204)
  })
  routes.openapi(createDomainRoute, async (c) => {
    const domain = await executeProjects(() =>
      service.createDomain(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(domain, 201)
  })
  routes.openapi(updateDomainRoute, async (c) => {
    const domain = await executeProjects(() =>
      service.updateDomain(c.var.user, c.req.valid('param').domainId, c.req.valid('json')),
    )
    return c.json(domain, 200)
  })
  routes.openapi(deleteDomainRoute, async (c) => {
    await executeProjects(() => service.deleteDomain(c.var.user, c.req.valid('param').domainId))
    return c.body(null, 204)
  })
  routes.openapi(createChecklistItemRoute, async (c) => {
    const item = await executeProjects(() =>
      service.createChecklistItem(c.var.user, c.req.valid('param').domainId, c.req.valid('json')),
    )
    return c.json(item, 201)
  })
  routes.openapi(updateChecklistItemRoute, async (c) => {
    const item = await executeProjects(() =>
      service.updateChecklistItem(c.var.user, c.req.valid('param').itemId, c.req.valid('json')),
    )
    return c.json(item, 200)
  })
  routes.openapi(deleteChecklistItemRoute, async (c) => {
    await executeProjects(() =>
      service.deleteChecklistItem(c.var.user, c.req.valid('param').itemId),
    )
    return c.body(null, 204)
  })

  return routes
}
