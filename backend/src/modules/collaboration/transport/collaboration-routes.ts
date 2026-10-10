import {
  apiErrorSchema,
  commentParamsSchema,
  commentSchema,
  commentsQuerySchema,
  commentsResponseSchema,
  createCommentRequestSchema,
  markThreadReadRequestSchema,
  notificationsResponseSchema,
  projectParamsSchema,
  updateCommentRequestSchema,
} from '@ordiks-survey/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { MiddlewareHandler } from 'hono'

import { validationErrorHook } from '../../../http/errors'
import { ingressErrorResponses } from '../../../http/openapi'
import type { AuthHttpEnv } from '../../auth'
import type { CommentsService } from '../application/comments-service'
import type { NotificationsService } from '../application/notifications-service'
import { executeCollaboration } from './errors'

const errorContent = {
  'application/json': {
    schema: apiErrorSchema,
  },
}

const bearerSecurity = [{ BearerAuth: [] }]

const unauthorized = { 401: { content: errorContent, description: 'Authentication required' } }

const listCommentsRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/comments',
  security: bearerSecurity,
  request: { params: projectParamsSchema, query: commentsQuerySchema },
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: commentsResponseSchema } },
      description: 'Thread comments, ascending by time',
    },
    400: { content: errorContent, description: 'Thread object not found in this project' },
    ...unauthorized,
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const createCommentRoute = createRoute({
  method: 'post',
  path: '/projects/{projectId}/comments',
  security: bearerSecurity,
  request: {
    params: projectParamsSchema,
    body: { content: { 'application/json': { schema: createCommentRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    201: { content: { 'application/json': { schema: commentSchema } }, description: 'Created comment' },
    400: { content: errorContent, description: 'Thread object not found in this project' },
    ...unauthorized,
    403: { content: errorContent, description: 'Observers cannot comment' },
    404: { content: errorContent, description: 'Project not found' },
  },
})

const updateCommentRoute = createRoute({
  method: 'patch',
  path: '/comments/{commentId}',
  security: bearerSecurity,
  request: {
    params: commentParamsSchema,
    body: { content: { 'application/json': { schema: updateCommentRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    200: { content: { 'application/json': { schema: commentSchema } }, description: 'Updated comment' },
    400: { content: errorContent, description: 'Invalid payload' },
    ...unauthorized,
    403: { content: errorContent, description: 'Only the author and the Ordiks team can edit' },
    404: { content: errorContent, description: 'Comment not found' },
  },
})

const deleteCommentRoute = createRoute({
  method: 'delete',
  path: '/comments/{commentId}',
  security: bearerSecurity,
  request: { params: commentParamsSchema },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Deleted comment' },
    ...unauthorized,
    403: { content: errorContent, description: 'Only the author and the Ordiks team can delete' },
    404: { content: errorContent, description: 'Comment not found' },
  },
})

const listNotificationsRoute = createRoute({
  method: 'get',
  path: '/me/notifications',
  security: bearerSecurity,
  responses: {
    ...ingressErrorResponses,
    200: {
      content: { 'application/json': { schema: notificationsResponseSchema } },
      description: 'Unread comments in accessible projects with thread and project context',
    },
    ...unauthorized,
  },
})

const markThreadReadRoute = createRoute({
  method: 'post',
  path: '/me/notifications/read',
  security: bearerSecurity,
  request: {
    body: { content: { 'application/json': { schema: markThreadReadRequestSchema } } },
  },
  responses: {
    ...ingressErrorResponses,
    204: { description: 'Thread marked read; its comments stop being unread' },
    400: { content: errorContent, description: 'Invalid payload' },
    ...unauthorized,
    403: { content: errorContent, description: 'No access to this project' },
    404: { content: errorContent, description: 'Thread object not found' },
  },
})

type CreateCollaborationRoutesOptions = {
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  commentsService: CommentsService
  notificationsService: NotificationsService
}

/** Комментарии-треды и центр уведомлений; монтируются под /api. */
export function createCollaborationRoutes({
  requireAuth,
  commentsService,
  notificationsService,
}: CreateCollaborationRoutesOptions) {
  const routes = new OpenAPIHono<AuthHttpEnv>({ defaultHook: validationErrorHook })

  routes.use('/projects/:projectId/comments', requireAuth)
  routes.use('/comments/:commentId', requireAuth)
  routes.use('/me/notifications', requireAuth)
  routes.use('/me/notifications/*', requireAuth)

  routes.openapi(listCommentsRoute, async (c) => {
    const items = await executeCollaboration(() =>
      commentsService.listThread(c.var.user, c.req.valid('param').projectId, c.req.valid('query')),
    )
    return c.json({ items }, 200)
  })
  routes.openapi(createCommentRoute, async (c) => {
    const comment = await executeCollaboration(() =>
      commentsService.createComment(c.var.user, c.req.valid('param').projectId, c.req.valid('json')),
    )
    return c.json(comment, 201)
  })
  routes.openapi(updateCommentRoute, async (c) => {
    const comment = await executeCollaboration(() =>
      commentsService.updateComment(c.var.user, c.req.valid('param').commentId, c.req.valid('json')),
    )
    return c.json(comment, 200)
  })
  routes.openapi(deleteCommentRoute, async (c) => {
    await executeCollaboration(() =>
      commentsService.deleteComment(c.var.user, c.req.valid('param').commentId),
    )
    return c.body(null, 204)
  })
  routes.openapi(listNotificationsRoute, async (c) => {
    const items = await executeCollaboration(() => notificationsService.listNotifications(c.var.user))
    return c.json({ items }, 200)
  })
  routes.openapi(markThreadReadRoute, async (c) => {
    await executeCollaboration(() => notificationsService.markThreadRead(c.var.user, c.req.valid('json')))
    return c.body(null, 204)
  })

  return routes
}
