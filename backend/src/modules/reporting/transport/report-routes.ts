import {
  apiErrorSchema,
  createReportSectionRequestSchema,
  projectParamsSchema,
  projectReportSchema,
  reportInsertRequestSchema,
  reportInsertResponseSchema,
  reportSectionParamsSchema,
  reportSectionSchema,
  sectionApprovalRequestSchema,
  updateReportSectionRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { ReportService } from '../application/report-service'
import { executeReporting } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const unauthorized = { 401: { content: errorContent, description: 'Authentication required' } }
const readForbidden = { 403: { content: errorContent, description: 'No access to this project' } }
const writeForbidden = {
  403: { content: errorContent, description: 'Only the Ordiks team can edit the report' },
}

const getReportRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/report',
  security: bearerSecurity,
  request: { params: projectParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: projectReportSchema } },
      description: 'Sections with approvals and the readiness summary',
    },
    ...unauthorized,
    ...readForbidden,
    404: { content: errorContent, description: 'Project not found' },
  },
})

const insertRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/report/insert',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: reportInsertRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: reportInsertResponseSchema } },
      description: 'Section with the generated table appended to its body',
    },
    400: { content: errorContent, description: 'Nothing to insert (empty source) or foreign link' },
    ...unauthorized,
    ...writeForbidden,
    404: { content: errorContent, description: 'Section not found' },
  },
})

const createSectionRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/report/sections',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createReportSectionRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: { content: { 'application/json': { schema: reportSectionSchema } }, description: 'Created section' },
    400: { content: errorContent, description: 'Invalid payload' },
    ...unauthorized,
    ...writeForbidden,
    404: { content: errorContent, description: 'Project not found' },
  },
})

const getSectionRoute = createRoute({
  method: 'get',
  path: '/report-sections/{sectionId}',
  security: bearerSecurity,
  request: { params: reportSectionParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: reportSectionSchema } }, description: 'Section with approvals' },
    ...unauthorized,
    ...readForbidden,
    404: { content: errorContent, description: 'Section not found' },
  },
})

const updateSectionRoute = createRoute({
  method: 'patch',
  path: '/report-sections/{sectionId}',
  security: bearerSecurity,
  request: {
    params: reportSectionParamsSchema,
    body: { content: { 'application/json': { schema: updateReportSectionRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: reportSectionSchema } },
      description: 'Updated section; content edits reset approvals',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    ...unauthorized,
    ...writeForbidden,
    404: { content: errorContent, description: 'Section not found' },
  },
})

const deleteSectionRoute = createRoute({
  method: 'delete',
  path: '/report-sections/{sectionId}',
  security: bearerSecurity,
  request: { params: reportSectionParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted section with approvals' },
    ...unauthorized,
    ...writeForbidden,
    404: { content: errorContent, description: 'Section not found' },
  },
})

const approveSectionRoute = createRoute({
  method: 'put',
  path: '/report-sections/{sectionId}/approval',
  security: bearerSecurity,
  request: {
    params: reportSectionParamsSchema,
    body: { content: { 'application/json': { schema: sectionApprovalRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: reportSectionSchema } },
      description: 'Approval recorded (upsert); observers are refused',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    ...unauthorized,
    403: { content: errorContent, description: 'Observers cannot approve sections' },
    404: { content: errorContent, description: 'Section not found' },
  },
})

type CreateReportRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: ReportService
}

/** Отчёт: разделы, автовставки, визы, сводка готовности; монтируются под /api. */
export function createReportRoutes({ requireAuth, service }: CreateReportRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/report', requireAuth)
  routes.use('/projects/:projectId/report/*', requireAuth)
  routes.use('/report-sections/:sectionId', requireAuth)
  routes.use('/report-sections/:sectionId/*', requireAuth)

  routes.openapi(getReportRoute, async (c) => {
    const report = await executeReporting(() => service.getReport(c.var.user, c.req.valid('param').projectId))
    return c.json(report, 200)
  })
  routes.openapi(insertRoute, async (c) => {
    const result = await executeReporting(() =>
      service.insert(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json({ section: result }, 200)
  })
  routes.openapi(createSectionRoute, async (c) => {
    const section = await executeReporting(() =>
      service.createSection(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(section, 201)
  })
  routes.openapi(getSectionRoute, async (c) => {
    const section = await executeReporting(() => service.getSection(c.var.user, c.req.valid('param').sectionId))
    return c.json(section, 200)
  })
  routes.openapi(updateSectionRoute, async (c) => {
    const section = await executeReporting(() =>
      service.updateSection(c.var.user, c.req.valid('param').sectionId, c.req.valid('json')),
    )
    return c.json(section, 200)
  })
  routes.openapi(deleteSectionRoute, async (c) => {
    await executeReporting(() => service.deleteSection(c.var.user, c.req.valid('param').sectionId))
    return c.body(null, 204)
  })
  routes.openapi(approveSectionRoute, async (c) => {
    const section = await executeReporting(() =>
      service.approve(c.var.user, c.req.valid('param').sectionId, c.req.valid('json')),
    )
    return c.json(section, 200)
  })

  return routes
}
