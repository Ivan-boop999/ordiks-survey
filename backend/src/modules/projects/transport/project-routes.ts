import {
  apiErrorSchema,
  createProjectMemberRequestSchema,
  createProjectRequestSchema,
  projectDetailSchema,
  projectMemberSchema,
  projectMembersResponseSchema,
  projectParamsSchema,
  projectMemberParamsSchema,
  projectsResponseSchema,
  updateProjectMemberRequestSchema,
  updateProjectRequestSchema,
  updateProjectStatusRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { ProjectsService } from '../application/projects-service'
import { executeProjects } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listProjectsRoute = createRoute({
  method: 'get',
  path: '/projects',
  security: bearerSecurity,
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: projectsResponseSchema } },
      description: 'Projects visible to the current user (team: all, client: memberships)',
    },
    401: { content: errorContent, description: 'Authentication required' },
  },
})

const createProjectRoute = createRoute({
  method: 'post',
  path: '/projects',
  security: bearerSecurity,
  request: {
    body: {
      content: { 'application/json': { schema: createProjectRequestSchema } },
    },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: projectDetailSchema } },
      description: 'Created project from fields, shops, settings, and the template object',
    },
    400: { content: errorContent, description: 'Invalid payload or template' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can create projects' },
  },
})

const getProjectRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: projectDetailSchema } },
      description: 'Project passport: boundaries, goals, shops, dictionaries, and members',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const updateProjectRoute = createRoute({
  method: 'patch',
  path: '/projects/{projectId}',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: updateProjectRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: projectDetailSchema } },
      description: 'Updated project passport',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const updateProjectStatusRoute = createRoute({
  method: 'patch',
  path: '/projects/{projectId}/status',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: updateProjectStatusRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: projectDetailSchema } },
      description: 'Archived or reactivated project',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can archive projects' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const listMembersRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/members',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: projectMembersResponseSchema } },
      description: 'Project members with user profiles',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const addMemberRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/members',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createProjectMemberRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: projectMemberSchema } },
      description: 'Added member',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only owners and managers can manage members' },
    404: { content: errorContent, description: 'Project or user not found' },
    409: { content: errorContent, description: 'User is already a member' },
  },
})

const updateMemberRoute = createRoute({
  method: 'patch',
  path: '/projects/{projectId}/members/{memberId}',
  security: bearerSecurity,
  request: {
    params: projectMemberParamsSchema,
    body: { content: { 'application/json': { schema: updateProjectMemberRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: projectMemberSchema } },
      description: 'Updated member role',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only owners and managers can manage members' },
    404: { content: errorContent, description: 'Member not found' },
  },
})

const removeMemberRoute = createRoute({
  method: 'delete',
  path: '/projects/{projectId}/members/{memberId}',
  security: bearerSecurity,
  request: {
    params: projectMemberParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Removed member' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only owners and managers can manage members' },
    404: { content: errorContent, description: 'Member not found' },
  },
})

type CreateProjectRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: ProjectsService
}

/** Маршруты проектов и состава; монтируются под /api. */
export function createProjectRoutes({ requireAuth, service }: CreateProjectRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects', requireAuth)
  routes.use('/projects/*', requireAuth)
  routes.openapi(listProjectsRoute, async (c) => {
    const items = await executeProjects(() => service.listProjects(c.var.user))
    return c.json({ items }, 200)
  })
  routes.openapi(createProjectRoute, async (c) => {
    const project = await executeProjects(() =>
      service.createProject(c.var.user, c.req.valid('json')),
    )
    return c.json(project, 201)
  })
  routes.openapi(getProjectRoute, async (c) => {
    const project = await executeProjects(() =>
      service.getProject(c.var.user, c.req.valid('param').projectId),
    )
    return c.json(project, 200)
  })
  routes.openapi(updateProjectRoute, async (c) => {
    const project = await executeProjects(() =>
      service.updateProject(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(project, 200)
  })
  routes.openapi(updateProjectStatusRoute, async (c) => {
    const project = await executeProjects(() =>
      service.updateProjectStatus(
        c.var.user,
        c.req.valid('param').projectId,
        c.req.valid('json').status,
      ),
    )
    return c.json(project, 200)
  })
  routes.openapi(listMembersRoute, async (c) => {
    const items = await executeProjects(() =>
      service.listMembers(c.var.user, c.req.valid('param').projectId),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(addMemberRoute, async (c) => {
    const member = await executeProjects(() =>
      service.addMember(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(member, 201)
  })
  routes.openapi(updateMemberRoute, async (c) => {
    const member = await executeProjects(() =>
      service.updateMemberRole(
        c.var.user,
        c.req.valid('param').projectId,
        c.req.valid('param').memberId,
        c.req.valid('json').role,
      ),
    )
    return c.json(member, 200)
  })
  routes.openapi(removeMemberRoute, async (c) => {
    await executeProjects(() =>
      service.removeMember(
        c.var.user,
        c.req.valid('param').projectId,
        c.req.valid('param').memberId,
      ),
    )
    return c.body(null, 204)
  })

  return routes
}
