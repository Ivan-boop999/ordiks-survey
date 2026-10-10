import {
  apiErrorSchema,
  confirmProcessSchemeUploadRequestSchema,
  createProcessRequestSchema,
  createProcessSchemeUploadRequestSchema,
  createProcessSchemeUploadResponseSchema,
  createProcessStepRequestSchema,
  processParamsSchema,
  processSchema,
  processSchemeDownloadSchema,
  processSideParamsSchema,
  processesResponseSchema,
  processStepParamsSchema,
  projectParamsSchema,
  reorderProcessStepsRequestSchema,
  updateProcessRequestSchema,
  updateProcessStepRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { ProcessesService } from '../application/processes-service'
import { executeProcesses } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listProcessesRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/processes',
  security: bearerSecurity,
  request: { params: projectParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: processesResponseSchema } },
      description: 'Processes with AS-IS/TO-BE steps and scheme metadata',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createProcessRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/processes',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createProcessRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: processSchema } },
      description: 'Created process',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit processes' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const getProcessRoute = createRoute({
  method: 'get',
  path: '/processes/{processId}',
  security: bearerSecurity,
  request: { params: processParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: processSchema } }, description: 'Process tree' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Process not found' },
  },
})

const updateProcessRoute = createRoute({
  method: 'patch',
  path: '/processes/{processId}',
  security: bearerSecurity,
  request: {
    params: processParamsSchema,
    body: { content: { 'application/json': { schema: updateProcessRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: processSchema } }, description: 'Updated process' },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit processes' },
    404: { content: errorContent, description: 'Process not found' },
  },
})

const deleteProcessRoute = createRoute({
  method: 'delete',
  path: '/processes/{processId}',
  security: bearerSecurity,
  request: { params: processParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted process with its steps and schemes' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit processes' },
    404: { content: errorContent, description: 'Process not found' },
  },
})

const createStepRoute = createRoute({
  method: 'post',
  path: '/processes/{processId}/steps',
  security: bearerSecurity,
  request: {
    params: processParamsSchema,
    body: { content: { 'application/json': { schema: createProcessStepRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: { content: { 'application/json': { schema: processSchema } }, description: 'Process with the new step' },
    400: { content: errorContent, description: 'Invalid payload or map target' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit processes' },
    404: { content: errorContent, description: 'Process not found' },
  },
})

const reorderStepsRoute = createRoute({
  method: 'post',
  path: '/processes/{processId}/steps/reorder',
  security: bearerSecurity,
  request: {
    params: processParamsSchema,
    body: { content: { 'application/json': { schema: reorderProcessStepsRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: processSchema } }, description: 'Reordered steps' },
    400: { content: errorContent, description: 'The list must cover one side exactly once' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit processes' },
    404: { content: errorContent, description: 'Process not found' },
  },
})

const updateStepRoute = createRoute({
  method: 'patch',
  path: '/process-steps/{stepId}',
  security: bearerSecurity,
  request: {
    params: processStepParamsSchema,
    body: { content: { 'application/json': { schema: updateProcessStepRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: processSchema } }, description: 'Process with the updated step' },
    400: { content: errorContent, description: 'Invalid payload or map target' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit processes' },
    404: { content: errorContent, description: 'Step not found' },
  },
})

const deleteStepRoute = createRoute({
  method: 'delete',
  path: '/process-steps/{stepId}',
  security: bearerSecurity,
  request: { params: processStepParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted step' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit processes' },
    404: { content: errorContent, description: 'Step not found' },
  },
})

const createSchemeUploadRoute = createRoute({
  method: 'post',
  path: '/processes/{processId}/schemes/{side}/upload-request',
  security: bearerSecurity,
  request: {
    params: processSideParamsSchema,
    body: { content: { 'application/json': { schema: createProcessSchemeUploadRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: createProcessSchemeUploadResponseSchema } },
      description: 'Presigned upload ticket (projects/{projectId}/processes/{processId}/{side}/{uuid})',
    },
    400: { content: errorContent, description: 'Invalid payload or storage limit' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can upload schemes' },
    404: { content: errorContent, description: 'Process not found' },
  },
})

const confirmSchemeUploadRoute = createRoute({
  method: 'post',
  path: '/processes/{processId}/schemes/{side}/confirm',
  security: bearerSecurity,
  request: {
    params: processSideParamsSchema,
    body: { content: { 'application/json': { schema: confirmProcessSchemeUploadRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: processSchema } }, description: 'Process with the stored scheme' },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can attach schemes' },
    404: { content: errorContent, description: 'Process not found' },
    409: { content: errorContent, description: 'Upload incomplete or rejected' },
    410: { content: errorContent, description: 'Upload window expired' },
  },
})

const downloadSchemeRoute = createRoute({
  method: 'get',
  path: '/processes/{processId}/schemes/{side}/download',
  security: bearerSecurity,
  request: { params: processSideParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: processSchemeDownloadSchema } },
      description: 'Signed private download URL for every project role',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Process or scheme not found' },
  },
})

const deleteSchemeRoute = createRoute({
  method: 'delete',
  path: '/processes/{processId}/schemes/{side}',
  security: bearerSecurity,
  request: { params: processSideParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: processSchema } }, description: 'Process without the scheme' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can delete schemes' },
    404: { content: errorContent, description: 'Process not found' },
  },
})

type CreateProcessRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: ProcessesService
}

/** Процессы и схемы; монтируются под /api. */
export function createProcessRoutes({ requireAuth, service }: CreateProcessRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/processes', requireAuth)
  routes.use('/processes/:processId', requireAuth)
  routes.use('/processes/:processId/steps', requireAuth)
  routes.use('/processes/:processId/steps/reorder', requireAuth)
  routes.use('/processes/:processId/schemes/:side', requireAuth)
  routes.use('/processes/:processId/schemes/:side/*', requireAuth)
  routes.use('/process-steps/:stepId', requireAuth)

  routes.openapi(listProcessesRoute, async (c) => {
    const items = await executeProcesses(() =>
      service.listProcesses(c.var.user, c.req.valid('param').projectId),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createProcessRoute, async (c) => {
    const process = await executeProcesses(() =>
      service.createProcess(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(process, 201)
  })
  routes.openapi(getProcessRoute, async (c) => {
    const process = await executeProcesses(() => service.getProcess(c.var.user, c.req.valid('param').processId))
    return c.json(process, 200)
  })
  routes.openapi(updateProcessRoute, async (c) => {
    const process = await executeProcesses(() =>
      service.updateProcess(c.var.user, c.req.valid('param').processId, c.req.valid('json')),
    )
    return c.json(process, 200)
  })
  routes.openapi(deleteProcessRoute, async (c) => {
    await executeProcesses(() => service.deleteProcess(c.var.user, c.req.valid('param').processId))
    return c.body(null, 204)
  })
  routes.openapi(createStepRoute, async (c) => {
    const process = await executeProcesses(() =>
      service.createStep(c.var.user, c.req.valid('param').processId, c.req.valid('json')),
    )
    return c.json(process, 201)
  })
  routes.openapi(reorderStepsRoute, async (c) => {
    const process = await executeProcesses(() =>
      service.reorderSteps(c.var.user, c.req.valid('param').processId, c.req.valid('json')),
    )
    return c.json(process, 200)
  })
  routes.openapi(updateStepRoute, async (c) => {
    const process = await executeProcesses(() =>
      service.updateStep(c.var.user, c.req.valid('param').stepId, c.req.valid('json')),
    )
    return c.json(process, 200)
  })
  routes.openapi(deleteStepRoute, async (c) => {
    await executeProcesses(() => service.deleteStep(c.var.user, c.req.valid('param').stepId))
    return c.body(null, 204)
  })
  routes.openapi(createSchemeUploadRoute, async (c) => {
    const { processId, side } = c.req.valid('param')
    const result = await executeProcesses(() =>
      service.createSchemeUploadRequest(c.var.user, processId, side, c.req.valid('json')),
    )
    return c.json(result, 201)
  })
  routes.openapi(confirmSchemeUploadRoute, async (c) => {
    const { processId, side } = c.req.valid('param')
    const process = await executeProcesses(() =>
      service.confirmSchemeUpload(c.var.user, processId, side, c.req.valid('json')),
    )
    return c.json(process, 200)
  })
  routes.openapi(downloadSchemeRoute, async (c) => {
    const { processId, side } = c.req.valid('param')
    const download = await executeProcesses(() =>
      service.createSchemeDownloadUrl(c.var.user, processId, side),
    )
    return c.json(download, 200)
  })
  routes.openapi(deleteSchemeRoute, async (c) => {
    const { processId, side } = c.req.valid('param')
    const process = await executeProcesses(() => service.deleteScheme(c.var.user, processId, side))
    return c.json(process, 200)
  })

  return routes
}
