import {
  apiErrorSchema,
  bulkDeleteRegistryEntriesRequestSchema,
  bulkDeleteRegistryEntriesResponseSchema,
  bulkRegistryEntriesRequestSchema,
  bulkRegistryEntriesResponseSchema,
  createRegistryEntryRequestSchema,
  createRegistryFieldRequestSchema,
  createRegistryRequestSchema,
  createRegistryStatusRequestSchema,
  registryEntriesQuerySchema,
  registryEntriesResponseSchema,
  registryEntryParamsSchema,
  registryFieldParamsSchema,
  registryImportRequestSchema,
  registryImportResponseSchema,
  projectParamsSchema,
  registryParamsSchema,
  registrySchema,
  registryStatusDeletedSchema,
  registryStatusParamsSchema,
  registriesResponseSchema,
  updateRegistryEntryRequestSchema,
  updateRegistryFieldRequestSchema,
  updateRegistryRequestSchema,
  updateRegistryStatusRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { CustomRegistriesService } from '../application/custom-registries-service'
import { executeRegistries } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const crudResponses = (created: string, updated: string) => ({
  ...ingressErrorResponses,
  201: { content: { 'application/json': { schema: registrySchema } }, description: created },
  400: { content: errorContent, description: 'Invalid payload, key conflict, or type violation' },
  401: { content: errorContent, description: 'Authentication required' },
  403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
  404: { content: errorContent, description: 'Registry not found' },
  ...(updated ? { 200: { content: { 'application/json': { schema: registrySchema } }, description: updated } } : {}),
})

const listRegistriesRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/registries',
  security: bearerSecurity,
  request: { params: projectParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: registriesResponseSchema } },
      description: 'Custom registries with fields and statuses',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createRegistryRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/registries',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createRegistryRequestSchema } } },
  },
  responses: crudResponses('Created registry', ''),
})

const getRegistryRoute = createRoute({
  method: 'get',
  path: '/registries/{registryId}',
  security: bearerSecurity,
  request: { params: registryParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: registrySchema } }, description: 'Registry structure' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Registry not found' },
  },
})

const updateRegistryRoute = createRoute({
  method: 'patch',
  path: '/registries/{registryId}',
  security: bearerSecurity,
  request: {
    params: registryParamsSchema,
    body: { content: { 'application/json': { schema: updateRegistryRequestSchema } } },
  },
  responses: crudResponses('', 'Updated registry'),
})

const deleteRegistryRoute = createRoute({
  method: 'delete',
  path: '/registries/{registryId}',
  security: bearerSecurity,
  request: { params: registryParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted registry with fields, statuses, and entries' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Registry not found' },
  },
})

const createFieldRoute = createRoute({
  method: 'post',
  path: '/registries/{registryId}/fields',
  security: bearerSecurity,
  request: {
    params: registryParamsSchema,
    body: { content: { 'application/json': { schema: createRegistryFieldRequestSchema } } },
  },
  responses: crudResponses('Registry with the new field', ''),
})

const updateFieldRoute = createRoute({
  method: 'patch',
  path: '/registry-fields/{fieldId}',
  security: bearerSecurity,
  request: {
    params: registryFieldParamsSchema,
    body: { content: { 'application/json': { schema: updateRegistryFieldRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: registrySchema } }, description: 'Registry with the updated field' },
    400: { content: errorContent, description: 'Invalid payload, key conflict, or formula reference' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Field not found' },
  },
})

const deleteFieldRoute = createRoute({
  method: 'delete',
  path: '/registry-fields/{fieldId}',
  security: bearerSecurity,
  request: { params: registryFieldParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted field; entry values lost its key' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Field not found' },
  },
})

const createStatusRoute = createRoute({
  method: 'post',
  path: '/registries/{registryId}/statuses',
  security: bearerSecurity,
  request: {
    params: registryParamsSchema,
    body: { content: { 'application/json': { schema: createRegistryStatusRequestSchema } } },
  },
  responses: crudResponses('Registry with the new status', ''),
})

const updateStatusRoute = createRoute({
  method: 'patch',
  path: '/registry-statuses/{statusId}',
  security: bearerSecurity,
  request: {
    params: registryStatusParamsSchema,
    body: { content: { 'application/json': { schema: updateRegistryStatusRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: registrySchema } }, description: 'Registry with the updated status' },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Status not found' },
  },
})

const deleteStatusRoute = createRoute({
  method: 'delete',
  path: '/registry-statuses/{statusId}',
  security: bearerSecurity,
  request: { params: registryStatusParamsSchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: registryStatusDeletedSchema } },
      description: 'Deleted status; entries moved to the first remaining status',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Status not found' },
  },
})

const listEntriesRoute = createRoute({
  method: 'get',
  path: '/registries/{registryId}/entries',
  security: bearerSecurity,
  request: {
    params: registryParamsSchema,
    query: registryEntriesQuerySchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: registryEntriesResponseSchema } },
      description: 'Entries with computed formula fields, filtered by status and search',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Registry not found' },
  },
})

const createEntryRoute = createRoute({
  method: 'post',
  path: '/registries/{registryId}/entries',
  security: bearerSecurity,
  request: {
    params: registryParamsSchema,
    body: { content: { 'application/json': { schema: createRegistryEntryRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: registryEntriesResponseSchema.shape.items.element } },
      description: 'Created entry',
    },
    400: { content: errorContent, description: 'Values violate field types or reference unknown fields' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Registry not found' },
  },
})

const updateEntryRoute = createRoute({
  method: 'patch',
  path: '/registry-entries/{entryId}',
  security: bearerSecurity,
  request: {
    params: registryEntryParamsSchema,
    body: { content: { 'application/json': { schema: updateRegistryEntryRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: registryEntriesResponseSchema.shape.items.element } },
      description: 'Updated entry',
    },
    400: { content: errorContent, description: 'Values violate field types or reference unknown fields' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Entry not found' },
  },
})

const deleteEntryRoute = createRoute({
  method: 'delete',
  path: '/registry-entries/{entryId}',
  security: bearerSecurity,
  request: { params: registryEntryParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted entry' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Entry not found' },
  },
})

const bulkStatusRoute = createRoute({
  method: 'post',
  path: '/registries/{registryId}/entries/bulk-status',
  security: bearerSecurity,
  request: {
    params: registryParamsSchema,
    body: { content: { 'application/json': { schema: bulkRegistryEntriesRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: bulkRegistryEntriesResponseSchema } },
      description: 'Mass status change; foreign ids are skipped silently',
    },
    400: { content: errorContent, description: 'Status does not belong to this registry' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Registry not found' },
  },
})

const bulkDeleteRoute = createRoute({
  method: 'post',
  path: '/registries/{registryId}/entries/bulk-delete',
  security: bearerSecurity,
  request: {
    params: registryParamsSchema,
    body: { content: { 'application/json': { schema: bulkDeleteRegistryEntriesRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: bulkDeleteRegistryEntriesResponseSchema } },
      description: 'Mass deletion; foreign ids are skipped silently',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Registry not found' },
  },
})

const importRoute = createRoute({
  method: 'post',
  path: '/registries/{registryId}/import',
  security: bearerSecurity,
  request: {
    params: registryParamsSchema,
    body: { content: { 'application/json': { schema: registryImportRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: registryImportResponseSchema } },
      description: 'Import result: created entries and skipped lines with reasons',
    },
    400: { content: errorContent, description: 'Mapping has no usable columns' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only the Ordiks team can edit registries' },
    404: { content: errorContent, description: 'Registry not found' },
  },
})

type CreateRegistryRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: CustomRegistriesService
}

/** Свои реестры: конструктор + записи + импорт; монтируются под /api. */
export function createRegistryRoutes({ requireAuth, service }: CreateRegistryRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/registries', requireAuth)
  routes.use('/registries/:registryId', requireAuth)
  routes.use('/registries/:registryId/fields', requireAuth)
  routes.use('/registries/:registryId/statuses', requireAuth)
  routes.use('/registries/:registryId/entries', requireAuth)
  routes.use('/registries/:registryId/entries/*', requireAuth)
  routes.use('/registries/:registryId/import', requireAuth)
  routes.use('/registry-fields/:fieldId', requireAuth)
  routes.use('/registry-statuses/:statusId', requireAuth)
  routes.use('/registry-entries/:entryId', requireAuth)

  routes.openapi(listRegistriesRoute, async (c) => {
    const items = await executeRegistries(() =>
      service.listRegistries(c.var.user, c.req.valid('param').projectId),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createRegistryRoute, async (c) => {
    const registry = await executeRegistries(() =>
      service.createRegistry(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(registry, 201)
  })
  routes.openapi(getRegistryRoute, async (c) => {
    const registry = await executeRegistries(() =>
      service.getRegistry(c.var.user, c.req.valid('param').registryId),
    )
    return c.json(registry, 200)
  })
  routes.openapi(updateRegistryRoute, async (c) => {
    const registry = await executeRegistries(() =>
      service.updateRegistry(c.var.user, c.req.valid('param').registryId, c.req.valid('json')),
    )
    return c.json(registry, 200)
  })
  routes.openapi(deleteRegistryRoute, async (c) => {
    await executeRegistries(() => service.deleteRegistry(c.var.user, c.req.valid('param').registryId))
    return c.body(null, 204)
  })
  routes.openapi(createFieldRoute, async (c) => {
    const registry = await executeRegistries(() =>
      service.createField(c.var.user, c.req.valid('param').registryId, c.req.valid('json')),
    )
    return c.json(registry, 201)
  })
  routes.openapi(updateFieldRoute, async (c) => {
    const registry = await executeRegistries(() =>
      service.updateField(c.var.user, c.req.valid('param').fieldId, c.req.valid('json')),
    )
    return c.json(registry, 200)
  })
  routes.openapi(deleteFieldRoute, async (c) => {
    await executeRegistries(() => service.deleteField(c.var.user, c.req.valid('param').fieldId))
    return c.body(null, 204)
  })
  routes.openapi(createStatusRoute, async (c) => {
    const registry = await executeRegistries(() =>
      service.createStatus(c.var.user, c.req.valid('param').registryId, c.req.valid('json')),
    )
    return c.json(registry, 201)
  })
  routes.openapi(updateStatusRoute, async (c) => {
    const registry = await executeRegistries(() =>
      service.updateStatus(c.var.user, c.req.valid('param').statusId, c.req.valid('json')),
    )
    return c.json(registry, 200)
  })
  routes.openapi(deleteStatusRoute, async (c) => {
    const result = await executeRegistries(() =>
      service.deleteStatus(c.var.user, c.req.valid('param').statusId),
    )
    return c.json(result, 200)
  })
  routes.openapi(listEntriesRoute, async (c) => {
    const items = await executeRegistries(() =>
      service.listEntries(c.var.user, c.req.valid('param').registryId, c.req.valid('query')),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createEntryRoute, async (c) => {
    const entry = await executeRegistries(() =>
      service.createEntry(c.var.user, c.req.valid('param').registryId, c.req.valid('json')),
    )
    return c.json(entry, 201)
  })
  routes.openapi(updateEntryRoute, async (c) => {
    const entry = await executeRegistries(() =>
      service.updateEntry(c.var.user, c.req.valid('param').entryId, c.req.valid('json')),
    )
    return c.json(entry, 200)
  })
  routes.openapi(deleteEntryRoute, async (c) => {
    await executeRegistries(() => service.deleteEntry(c.var.user, c.req.valid('param').entryId))
    return c.body(null, 204)
  })
  routes.openapi(bulkStatusRoute, async (c) => {
    const { registryId } = c.req.valid('param')
    const result = await executeRegistries(() =>
      service.bulkUpdateStatus(c.var.user, registryId, c.req.valid('json').ids, c.req.valid('json').statusId),
    )
    return c.json(result, 200)
  })
  routes.openapi(bulkDeleteRoute, async (c) => {
    const { registryId } = c.req.valid('param')
    const result = await executeRegistries(() =>
      service.bulkDelete(c.var.user, registryId, c.req.valid('json').ids),
    )
    return c.json(result, 200)
  })
  routes.openapi(importRoute, async (c) => {
    const result = await executeRegistries(() =>
      service.importEntries(c.var.user, c.req.valid('param').registryId, c.req.valid('json')),
    )
    return c.json(result, 200)
  })

  return routes
}
