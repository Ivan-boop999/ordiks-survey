import {
  apiErrorSchema,
  createGuideQuestionRequestSchema,
  createGuideRequestSchema,
  createGuideSectionRequestSchema,
  guideParamsSchema,
  guideQuestionParamsSchema,
  guideSchema,
  guidesResponseSchema,
  guideSectionParamsSchema,
  projectParamsSchema,
  updateGuideQuestionRequestSchema,
  updateGuideRequestSchema,
  updateGuideSectionRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { GuidesService } from '../application/guides-service'
import { executeSurvey } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listGuidesRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/guides',
  security: bearerSecurity,
  request: { params: projectParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: guidesResponseSchema } },
      description: 'Guides with sections and questions in order',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createGuideRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/guides',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createGuideRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: guideSchema } },
      description: 'Created guide with sections and questions; showIf references rebound to new ids',
    },
    400: { content: errorContent, description: 'Invalid payload or conditional question tree' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit guides' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const getGuideRoute = createRoute({
  method: 'get',
  path: '/guides/{guideId}',
  security: bearerSecurity,
  request: { params: guideParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: guideSchema } },
      description: 'Guide with sections and questions',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Guide not found' },
  },
})

const updateGuideRoute = createRoute({
  method: 'patch',
  path: '/guides/{guideId}',
  security: bearerSecurity,
  request: {
    params: guideParamsSchema,
    body: { content: { 'application/json': { schema: updateGuideRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: guideSchema } },
      description: 'Renamed guide',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit guides' },
    404: { content: errorContent, description: 'Guide not found' },
  },
})

const deleteGuideRoute = createRoute({
  method: 'delete',
  path: '/guides/{guideId}',
  security: bearerSecurity,
  request: { params: guideParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted guide; interviews keep the project only' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit guides' },
    404: { content: errorContent, description: 'Guide not found' },
  },
})

const duplicateGuideRoute = createRoute({
  method: 'post',
  path: '/guides/{guideId}/duplicate',
  security: bearerSecurity,
  request: { params: guideParamsSchema },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: guideSchema } },
      description: 'Copied guide with fresh ids; showIf references rebound',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit guides' },
    404: { content: errorContent, description: 'Guide not found' },
  },
})

const createSectionRoute = createRoute({
  method: 'post',
  path: '/guides/{guideId}/sections',
  security: bearerSecurity,
  request: {
    params: guideParamsSchema,
    body: { content: { 'application/json': { schema: createGuideSectionRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: guideSchema } },
      description: 'Guide with the new section',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit guides' },
    404: { content: errorContent, description: 'Guide not found' },
  },
})

const updateSectionRoute = createRoute({
  method: 'patch',
  path: '/guide-sections/{sectionId}',
  security: bearerSecurity,
  request: {
    params: guideSectionParamsSchema,
    body: { content: { 'application/json': { schema: updateGuideSectionRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: guideSchema } },
      description: 'Guide with the renamed or reordered section',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit guides' },
    404: { content: errorContent, description: 'Section not found' },
  },
})

const deleteSectionRoute = createRoute({
  method: 'delete',
  path: '/guide-sections/{sectionId}',
  security: bearerSecurity,
  request: { params: guideSectionParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted section with its questions' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit guides' },
    404: { content: errorContent, description: 'Section not found' },
  },
})

const createQuestionRoute = createRoute({
  method: 'post',
  path: '/guide-sections/{sectionId}/questions',
  security: bearerSecurity,
  request: {
    params: guideSectionParamsSchema,
    body: { content: { 'application/json': { schema: createGuideQuestionRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: guideSchema } },
      description: 'Guide with the new question',
    },
    400: { content: errorContent, description: 'Invalid payload or conditional question tree' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit guides' },
    404: { content: errorContent, description: 'Section not found' },
  },
})

const updateQuestionRoute = createRoute({
  method: 'patch',
  path: '/guide-questions/{questionId}',
  security: bearerSecurity,
  request: {
    params: guideQuestionParamsSchema,
    body: { content: { 'application/json': { schema: updateGuideQuestionRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: guideSchema } },
      description: 'Guide with the updated question',
    },
    400: { content: errorContent, description: 'Invalid payload or conditional question tree' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit guides' },
    404: { content: errorContent, description: 'Question not found' },
  },
})

const deleteQuestionRoute = createRoute({
  method: 'delete',
  path: '/guide-questions/{questionId}',
  security: bearerSecurity,
  request: { params: guideQuestionParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted question; dependent conditions cleared' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit guides' },
    404: { content: errorContent, description: 'Question not found' },
  },
})

type CreateGuideRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: GuidesService
}

/** Гайды с секциями и вопросами; монтируются под /api. */
export function createGuideRoutes({ requireAuth, service }: CreateGuideRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/guides', requireAuth)
  routes.use('/guides/:guideId', requireAuth)
  routes.use('/guides/:guideId/sections', requireAuth)
  routes.use('/guides/:guideId/duplicate', requireAuth)
  routes.use('/guide-sections/:sectionId', requireAuth)
  routes.use('/guide-sections/:sectionId/questions', requireAuth)
  routes.use('/guide-questions/:questionId', requireAuth)

  routes.openapi(listGuidesRoute, async (c) => {
    const items = await executeSurvey(() =>
      service.listGuides(c.var.user, c.req.valid('param').projectId),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createGuideRoute, async (c) => {
    const guide = await executeSurvey(() =>
      service.createGuide(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(guide, 201)
  })
  routes.openapi(getGuideRoute, async (c) => {
    const guide = await executeSurvey(() => service.getGuide(c.var.user, c.req.valid('param').guideId))
    return c.json(guide, 200)
  })
  routes.openapi(updateGuideRoute, async (c) => {
    const guide = await executeSurvey(() =>
      service.updateGuide(c.var.user, c.req.valid('param').guideId, c.req.valid('json')),
    )
    return c.json(guide, 200)
  })
  routes.openapi(deleteGuideRoute, async (c) => {
    await executeSurvey(() => service.deleteGuide(c.var.user, c.req.valid('param').guideId))
    return c.body(null, 204)
  })
  routes.openapi(duplicateGuideRoute, async (c) => {
    const guide = await executeSurvey(() =>
      service.duplicateGuide(c.var.user, c.req.valid('param').guideId),
    )
    return c.json(guide, 201)
  })
  routes.openapi(createSectionRoute, async (c) => {
    const guide = await executeSurvey(() =>
      service.createSection(c.var.user, c.req.valid('param').guideId, c.req.valid('json')),
    )
    return c.json(guide, 201)
  })
  routes.openapi(updateSectionRoute, async (c) => {
    const guide = await executeSurvey(() =>
      service.updateSection(c.var.user, c.req.valid('param').sectionId, c.req.valid('json')),
    )
    return c.json(guide, 200)
  })
  routes.openapi(deleteSectionRoute, async (c) => {
    await executeSurvey(() => service.deleteSection(c.var.user, c.req.valid('param').sectionId))
    return c.body(null, 204)
  })
  routes.openapi(createQuestionRoute, async (c) => {
    const guide = await executeSurvey(() =>
      service.createQuestion(c.var.user, c.req.valid('param').sectionId, c.req.valid('json')),
    )
    return c.json(guide, 201)
  })
  routes.openapi(updateQuestionRoute, async (c) => {
    const guide = await executeSurvey(() =>
      service.updateQuestion(c.var.user, c.req.valid('param').questionId, c.req.valid('json')),
    )
    return c.json(guide, 200)
  })
  routes.openapi(deleteQuestionRoute, async (c) => {
    await executeSurvey(() => service.deleteQuestion(c.var.user, c.req.valid('param').questionId))
    return c.body(null, 204)
  })

  return routes
}
