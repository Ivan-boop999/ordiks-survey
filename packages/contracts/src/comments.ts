import { z } from 'zod'

import { threadTypeSchema } from './survey'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()

// ============================================================
// Комментарии-треды
// ============================================================

export const commentSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    threadType: threadTypeSchema,
    threadId: idSchema,
    authorId: idSchema,
    authorName: z.string().nullable(),
    authorEmail: z.string(),
    body: z.string(),
    needsAnswer: z.boolean(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
export type CommentDto = z.infer<typeof commentSchema>

export const commentsResponseSchema = z
  .object({
    items: z.array(commentSchema),
  })
  .strict()

export const commentsQuerySchema = z
  .object({
    threadType: threadTypeSchema,
    threadId: uuidSchema,
  })
  .strict()
export type CommentsQuery = z.infer<typeof commentsQuerySchema>

export const createCommentRequestSchema = z
  .object({
    threadType: threadTypeSchema,
    threadId: uuidSchema,
    body: z.string().trim().min(1).max(4000),
    /// SLA-маркер «вопрос ждёт ответа» (тосты и центр уведомлений).
    needsAnswer: z.boolean().default(false),
  })
  .strict()
export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>

export const updateCommentRequestSchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
  })
  .strict()
export type UpdateCommentRequest = z.infer<typeof updateCommentRequestSchema>

export const commentParamsSchema = z
  .object({
    commentId: uuidSchema,
  })
  .strict()

// ============================================================
// Центр уведомлений
// ============================================================

/// Маршрут веб-приложения для перехода к треду (ROUTE_BY_THREAD прототипа).
export const threadRouteSchema = z.enum([
  'facts',
  'findings',
  'interviews',
  'plan',
  'domains',
  'requests',
  'report',
  'processes',
  'registries',
])

/// Объект треда: заголовок и маршрут, чтобы уведомление вело в нужное место.
export const notificationThreadSchema = z
  .object({
    threadType: threadTypeSchema,
    threadId: idSchema,
    title: z.string(),
    route: threadRouteSchema,
  })
  .strict()
export type NotificationThread = z.infer<typeof notificationThreadSchema>

export const notificationProjectSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    client: z.string(),
  })
  .strict()

export const notificationItemSchema = z
  .object({
    comment: commentSchema,
    thread: notificationThreadSchema,
    project: notificationProjectSchema,
  })
  .strict()
export type NotificationItem = z.infer<typeof notificationItemSchema>

export const notificationsResponseSchema = z
  .object({
    items: z.array(notificationItemSchema),
  })
  .strict()

export const markThreadReadRequestSchema = z
  .object({
    threadType: threadTypeSchema,
    threadId: uuidSchema,
    /// projectId не нужен: тред привязан к объекту одного проекта; подтверждаем его же.
  })
  .strict()
export type MarkThreadReadRequest = z.infer<typeof markThreadReadRequestSchema>
