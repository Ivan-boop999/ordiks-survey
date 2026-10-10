import {
  apiErrorSchema,
  createStageRequestSchema,
  createTaskRequestSchema,
  projectParamsSchema,
  stageParamsSchema,
  stageSchema,
  stagesResponseSchema,
  taskParamsSchema,
  taskSchema,
  tasksQuerySchema,
  tasksResponseSchema,
  updateStageRequestSchema,
  updateTaskRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { PlanService } from '../application/plan-service'
import { executeProjects } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listStagesRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/stages',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: stagesResponseSchema } },
      description: 'Project stages in order',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createStageRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/stages',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createStageRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: stageSchema } },
      description: 'Created stage',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const updateStageRoute = createRoute({
  method: 'patch',
  path: '/stages/{stageId}',
  security: bearerSecurity,
  request: {
    params: stageParamsSchema,
    body: { content: { 'application/json': { schema: updateStageRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: stageSchema } },
      description: 'Updated stage',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Stage not found' },
  },
})

const deleteStageRoute = createRoute({
  method: 'delete',
  path: '/stages/{stageId}',
  security: bearerSecurity,
  request: {
    params: stageParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted stage; its tasks keep the project only' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Stage not found' },
  },
})

const listTasksRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/tasks',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    query: tasksQuerySchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: tasksResponseSchema } },
      description: 'Tasks filtered by stage, domain, assignee, and status',
    },
    400: { content: errorContent, description: 'Invalid query' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createTaskRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/tasks',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createTaskRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: taskSchema } },
      description: 'Created task',
    },
    400: { content: errorContent, description: 'Invalid payload or links outside this project' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const updateTaskRoute = createRoute({
  method: 'patch',
  path: '/tasks/{taskId}',
  security: bearerSecurity,
  request: {
    params: taskParamsSchema,
    body: { content: { 'application/json': { schema: updateTaskRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: taskSchema } },
      description: 'Updated task; done stamps doneAt, other statuses clear it',
    },
    400: { content: errorContent, description: 'Invalid payload or links outside this project' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Task not found' },
  },
})

const deleteTaskRoute = createRoute({
  method: 'delete',
  path: '/tasks/{taskId}',
  security: bearerSecurity,
  request: {
    params: taskParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted task' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit this project' },
    404: { content: errorContent, description: 'Task not found' },
  },
})

type CreatePlanRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: PlanService
}

/** Этапы и задачи; монтируются под /api. */
export function createPlanRoutes({ requireAuth, service }: CreatePlanRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/stages', requireAuth)
  routes.use('/projects/:projectId/tasks', requireAuth)
  routes.use('/stages/:stageId', requireAuth)
  routes.use('/tasks/:taskId', requireAuth)

  routes.openapi(listStagesRoute, async (c) => {
    const items = await executeProjects(() =>
      service.listStages(c.var.user, c.req.valid('param').projectId),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createStageRoute, async (c) => {
    const stage = await executeProjects(() =>
      service.createStage(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(stage, 201)
  })
  routes.openapi(updateStageRoute, async (c) => {
    const stage = await executeProjects(() =>
      service.updateStage(c.var.user, c.req.valid('param').stageId, c.req.valid('json')),
    )
    return c.json(stage, 200)
  })
  routes.openapi(deleteStageRoute, async (c) => {
    await executeProjects(() =>
      service.deleteStage(c.var.user, c.req.valid('param').stageId),
    )
    return c.body(null, 204)
  })
  routes.openapi(listTasksRoute, async (c) => {
    const items = await executeProjects(() =>
      service.listTasks(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createTaskRoute, async (c) => {
    const task = await executeProjects(() =>
      service.createTask(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(task, 201)
  })
  routes.openapi(updateTaskRoute, async (c) => {
    const task = await executeProjects(() =>
      service.updateTask(c.var.user, c.req.valid('param').taskId, c.req.valid('json')),
    )
    return c.json(task, 200)
  })
  routes.openapi(deleteTaskRoute, async (c) => {
    await executeProjects(() => service.deleteTask(c.var.user, c.req.valid('param').taskId))
    return c.body(null, 204)
  })

  return routes
}
