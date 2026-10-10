import {
  apiErrorSchema,
  createInterviewRequestSchema,
  interviewDetailSchema,
  interviewParamsSchema,
  interviewsQuerySchema,
  interviewsResponseSchema,
  interviewSchema,
  projectParamsSchema,
  saveInterviewAnswersRequestSchema,
  saveInterviewAnswersResponseSchema,
  updateInterviewRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { InterviewsService } from '../application/interviews-service'
import { executeSurvey } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listInterviewsRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/interviews',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    query: interviewsQuerySchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: interviewsResponseSchema } },
      description: 'Interviews filtered by status and domain',
    },
    400: { content: errorContent, description: 'Invalid query' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createInterviewRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/interviews',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createInterviewRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: interviewDetailSchema } },
      description: 'Created interview',
    },
    400: { content: errorContent, description: 'Invalid payload or links outside this project' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can plan interviews' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const getInterviewRoute = createRoute({
  method: 'get',
  path: '/interviews/{interviewId}',
  security: bearerSecurity,
  request: { params: interviewParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: interviewDetailSchema } },
      description: 'Interview with answers',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Interview not found' },
  },
})

const updateInterviewRoute = createRoute({
  method: 'patch',
  path: '/interviews/{interviewId}',
  security: bearerSecurity,
  request: {
    params: interviewParamsSchema,
    body: { content: { 'application/json': { schema: updateInterviewRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: interviewDetailSchema } },
      description: 'Updated interview',
    },
    400: { content: errorContent, description: 'Invalid payload or links outside this project' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit interviews' },
    404: { content: errorContent, description: 'Interview not found' },
  },
})

const deleteInterviewRoute = createRoute({
  method: 'delete',
  path: '/interviews/{interviewId}',
  security: bearerSecurity,
  request: { params: interviewParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted interview with its answers' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can delete interviews' },
    404: { content: errorContent, description: 'Interview not found' },
  },
})

const saveAnswersRoute = createRoute({
  method: 'put',
  path: '/interviews/{interviewId}/answers',
  security: bearerSecurity,
  request: {
    params: interviewParamsSchema,
    body: { content: { 'application/json': { schema: saveInterviewAnswersRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: saveInterviewAnswersResponseSchema } },
      description: 'Answers replaced; unanswered and condition-hidden questions are dropped',
    },
    400: { content: errorContent, description: 'Invalid answer values for the guide question types' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can fill answers' },
    404: { content: errorContent, description: 'Interview not found' },
    409: { content: errorContent, description: 'Interview has no guide' },
  },
})

type CreateInterviewRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: InterviewsService
}

/** Интервью и ответы; монтируются под /api. */
export function createInterviewRoutes({ requireAuth, service }: CreateInterviewRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/interviews', requireAuth)
  routes.use('/interviews/:interviewId', requireAuth)
  routes.use('/interviews/:interviewId/answers', requireAuth)

  routes.openapi(listInterviewsRoute, async (c) => {
    const items = await executeSurvey(() =>
      service.listInterviews(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createInterviewRoute, async (c) => {
    const interview = await executeSurvey(() =>
      service.createInterview(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(interview, 201)
  })
  routes.openapi(getInterviewRoute, async (c) => {
    const interview = await executeSurvey(() =>
      service.getInterview(c.var.user, c.req.valid('param').interviewId),
    )
    return c.json(interview, 200)
  })
  routes.openapi(updateInterviewRoute, async (c) => {
    const interview = await executeSurvey(() =>
      service.updateInterview(c.var.user, c.req.valid('param').interviewId, c.req.valid('json')),
    )
    return c.json(interview, 200)
  })
  routes.openapi(deleteInterviewRoute, async (c) => {
    await executeSurvey(() => service.deleteInterview(c.var.user, c.req.valid('param').interviewId))
    return c.body(null, 204)
  })
  routes.openapi(saveAnswersRoute, async (c) => {
    const result = await executeSurvey(() =>
      service.saveAnswers(c.var.user, c.req.valid('param').interviewId, c.req.valid('json')),
    )
    return c.json(result, 200)
  })

  return routes
}
