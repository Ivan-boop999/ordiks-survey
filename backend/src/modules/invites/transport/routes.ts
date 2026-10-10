import {
  acceptInviteRequestSchema,
  acceptInviteResponseSchema,
  apiErrorSchema,
  createInviteRequestSchema,
  inviteParamsSchema,
  inviteSchema,
  invitesResponseSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { InvitesService } from '../application/invites-service'
import { executeInvites } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const listInvitesRoute = createRoute({
  method: 'get',
  path: '/invites',
  security: bearerSecurity,
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: invitesResponseSchema } },
      description: 'Invites newest first, with the computed active flag',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only owners and managers can manage invites' },
  },
})

const createInviteRoute = createRoute({
  method: 'post',
  path: '/invites',
  security: bearerSecurity,
  request: {
    body: { content: { 'application/json': { schema: createInviteRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: inviteSchema } },
      description: 'Created invite with a cryptorandom code',
    },
    400: { content: errorContent, description: 'Invalid payload' },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only owners and managers can manage invites' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const deactivateInviteRoute = createRoute({
  method: 'delete',
  path: '/invites/{inviteId}',
  security: bearerSecurity,
  request: {
    params: inviteParamsSchema,
  },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: inviteSchema } },
      description: 'Deactivated invite (expires now)',
    },
    401: { content: errorContent, description: 'Authentication required' },
    403: { content: errorContent, description: 'Only owners and managers can manage invites' },
    404: { content: errorContent, description: 'Invite not found' },
  },
})

const acceptInviteRoute = createRoute({
  method: 'post',
  path: '/invites/accept',
  // Публичный эндпоинт: аккаунта ещё нет. Лимит на адрес клиента — общий бюджет /api/*
  // (createAuthSecurity('account') в app.ts), как у остальных записей вне /api/auth.
  request: {
    body: { content: { 'application/json': { schema: acceptInviteRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: {
      content: { 'application/json': { schema: acceptInviteResponseSchema } },
      description: 'Created account with the invite org role and project membership',
    },
    400: { content: errorContent, description: 'Invalid payload or invite code' },
    409: { content: errorContent, description: 'Email already exists' },
  },
})

type CreateInvitesRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  service: InvitesService
}

/** Приглашения; монтируются под /api. */
export function createInvitesRoutes({ requireAuth, service }: CreateInvitesRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/invites', requireAuth)
  // Всё под /invites/* требует входа, кроме публичного POST /invites/accept: аккаунта ещё нет.
  routes.use('/invites/*', (c, next) => {
    if (c.req.method === 'POST' && c.req.path.endsWith('/invites/accept')) return next()
    return requireAuth(c, next)
  })
  routes.openapi(listInvitesRoute, async (c) => {
    const items = await executeInvites(() => service.listInvites(c.var.user))
    return c.json({ items }, 200)
  })
  routes.openapi(createInviteRoute, async (c) => {
    const invite = await executeInvites(() => service.createInvite(c.var.user, c.req.valid('json')))
    return c.json(invite, 201)
  })
  routes.openapi(deactivateInviteRoute, async (c) => {
    const invite = await executeInvites(() =>
      service.deactivateInvite(c.var.user, c.req.valid('param').inviteId),
    )
    return c.json(invite, 200)
  })
  routes.openapi(acceptInviteRoute, async (c) => {
    const accepted = await executeInvites(() => service.acceptInvite(c.req.valid('json')))
    return c.json(accepted, 201)
  })

  return routes
}
