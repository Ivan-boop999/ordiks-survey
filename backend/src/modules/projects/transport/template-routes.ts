import {
  apiErrorSchema,
  createProjectFromTemplateRequestSchema,
  createProjectTemplateRequestSchema,
  projectDetailSchema,
  projectParamsSchema,
  projectTemplateParamsSchema,
  projectTemplateRecordSchema,
  projectTemplatesResponseSchema,
  projectToTemplateRequestSchema,
  updateProjectTemplateRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { TemplatesService } from '../application/templates-service'
import { executeProjects } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listTemplatesRoute = createRoute({
  method: 'get',
  path: '/project-templates',
  security: bearerSecurity,
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: projectTemplatesResponseSchema } },
      description: 'Template library (Ordiks team only)',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can browse templates' },
  },
})

const createTemplateRoute = createRoute({
  method: 'post',
  path: '/project-templates',
  security: bearerSecurity,
  request: {
    body: { content: { 'application/json': { schema: createProjectTemplateRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: { content: { 'application/json': { schema: projectTemplateRecordSchema } }, description: 'Created template' },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only owners and managers can manage templates' },
  },
})

const updateTemplateRoute = createRoute({
  method: 'patch',
  path: '/project-templates/{templateId}',
  security: bearerSecurity,
  request: {
    params: projectTemplateParamsSchema,
    body: { content: { 'application/json': { schema: updateProjectTemplateRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: projectTemplateRecordSchema } }, description: 'Updated template' },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only owners and managers can manage templates' },
    404: { content: errorContent, description: 'Template not found' },
  },
})

const deleteTemplateRoute = createRoute({
  method: 'delete',
  path: '/project-templates/{templateId}',
  security: bearerSecurity,
  request: { params: projectTemplateParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted template' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only owners and managers can manage templates' },
    404: { content: errorContent, description: 'Template not found' },
  },
})

const createProjectFromTemplateRoute = createRoute({
  method: 'post',
  path: '/projects/from-template',
  security: bearerSecurity,
  request: {
    body: { content: { 'application/json': { schema: createProjectFromTemplateRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: projectDetailSchema } },
      description: 'Project unfolded from the template with fresh ids and no progress',
    },
    400: { content: errorContent, description: 'Invalid payload or template' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can create projects' },
    404: { content: errorContent, description: 'Template not found' },
  },
})

const projectToTemplateRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/to-template',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: projectToTemplateRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: projectTemplateRecordSchema } },
      description: 'Snapshot of the project structure (no entries or progress) as a template',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only owners and managers can manage templates' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

type CreateTemplateRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: TemplatesService
}

/** Библиотека методик; монтируется под /api. */
export function createTemplateRoutes({ requireAuth, service }: CreateTemplateRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/project-templates', requireAuth)
  routes.use('/project-templates/*', requireAuth)
  routes.use('/projects/from-template', requireAuth)
  routes.use('/projects/*/to-template', requireAuth)

  routes.openapi(listTemplatesRoute, async (c) => {
    const items = await executeProjects(() => service.listTemplates(c.var.user))
    return c.json({ items }, 200)
  })
  routes.openapi(createTemplateRoute, async (c) => {
    const template = await executeProjects(() => service.createTemplate(c.var.user, c.req.valid('json')))
    return c.json(template, 201)
  })
  routes.openapi(updateTemplateRoute, async (c) => {
    const template = await executeProjects(() =>
      service.updateTemplate(c.var.user, c.req.valid('param').templateId, c.req.valid('json')),
    )
    return c.json(template, 200)
  })
  routes.openapi(deleteTemplateRoute, async (c) => {
    await executeProjects(() => service.deleteTemplate(c.var.user, c.req.valid('param').templateId))
    return c.body(null, 204)
  })
  routes.openapi(createProjectFromTemplateRoute, async (c) => {
    const project = await executeProjects(() =>
      service.createProjectFromTemplate(c.var.user, c.req.valid('json')),
    )
    return c.json(project, 201)
  })
  routes.openapi(projectToTemplateRoute, async (c) => {
    const template = await executeProjects(() =>
      service.projectToTemplate(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(template, 201)
  })

  return routes
}
