import type { NotificationThread, ThreadType } from '@ordiks-survey/contracts'

import type { DbClient } from '../../../db'
import { Prisma } from '../../../generated/prisma/client'
import type { CollaborationRepository, CommentRow, ProjectRefRow } from '../application/ports'

type PrismaCommentRow = {
  id: string
  projectId: string
  threadType: string
  threadId: string
  authorId: string
  body: string
  needsAnswer: boolean
  createdAt: Date
  updatedAt: Date
  author: { email: string; displayName: string | null }
}

function toCommentRow(row: PrismaCommentRow): CommentRow {
  return {
    id: row.id,
    projectId: row.projectId,
    threadType: row.threadType as ThreadType,
    threadId: row.threadId,
    authorId: row.authorId,
    authorName: row.author.displayName,
    authorEmail: row.author.email,
    body: row.body,
    needsAnswer: row.needsAnswer,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const authorInclude = { author: { select: { email: true, displayName: true } } } as const

/// Маршрут веб-приложения по типу треда (ROUTE_BY_THREAD прототипа).
const ROUTE_BY_THREAD: Record<ThreadType, NotificationThread['route']> = {
  fact: 'facts',
  finding: 'findings',
  interview: 'interviews',
  task: 'plan',
  request: 'requests',
  domain: 'domains',
  process: 'processes',
  report: 'report',
  registry_entry: 'registries',
}

export function createPrismaCollaborationRepository(db: DbClient): CollaborationRepository {
  /// Заголовок и проект объекта треда; каждая строка — один SELECT по типу.
  const threadInfoQueries: Record<ThreadType, (threadId: string) => Promise<{ projectId: string; title: string } | null>> = {
    fact: (threadId) =>
      db.fact
        .findUnique({ where: { id: threadId }, select: { projectId: true, title: true } })
        .then((row) => (row ? { projectId: row.projectId, title: row.title } : null)),
    finding: (threadId) =>
      db.finding
        .findUnique({ where: { id: threadId }, select: { projectId: true, title: true } })
        .then((row) => (row ? { projectId: row.projectId, title: row.title } : null)),
    interview: (threadId) =>
      db.interview
        .findUnique({ where: { id: threadId }, select: { projectId: true, respondent: true, respondentRole: true } })
        .then((row) =>
          row
            ? {
                projectId: row.projectId,
                title: row.respondentRole ? `${row.respondent} (${row.respondentRole})` : row.respondent,
              }
            : null,
        ),
    task: (threadId) =>
      db.task
        .findUnique({ where: { id: threadId }, select: { projectId: true, title: true } })
        .then((row) => (row ? { projectId: row.projectId, title: row.title } : null)),
    request: (threadId) =>
      db.dataRequest
        .findUnique({ where: { id: threadId }, select: { projectId: true, what: true } })
        .then((row) => (row ? { projectId: row.projectId, title: row.what } : null)),
    domain: (threadId) =>
      db.domain
        .findUnique({ where: { id: threadId }, select: { projectId: true, name: true } })
        .then((row) => (row ? { projectId: row.projectId, title: row.name } : null)),
    process: (threadId) =>
      db.process
        .findUnique({ where: { id: threadId }, select: { projectId: true, name: true } })
        .then((row) => (row ? { projectId: row.projectId, title: row.name } : null)),
    report: (threadId) =>
      db.reportSection
        .findUnique({ where: { id: threadId }, select: { projectId: true, title: true } })
        .then((row) => (row ? { projectId: row.projectId, title: row.title } : null)),
    registry_entry: (threadId) =>
      db.registryEntry
        .findUnique({
          where: { id: threadId },
          select: {
            values: true,
            registry: {
              select: { projectId: true, fields: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { key: true, type: true } } },
            },
          },
        })
        .then((row) => {
          if (!row) return null
          // Заголовок записи — значение первого text-поля (или «Запись реестра»).
          const values = (row.values ?? {}) as Record<string, unknown>
          const textField = row.registry.fields.find((field) => field.type === 'text')
          const value = textField ? values[textField.key] : undefined
          return { projectId: row.registry.projectId, title: typeof value === 'string' && value !== '' ? value : 'Запись реестра' }
        }),
  }

  return {
    listCommentsOfThread(projectId, threadType, threadId) {
      return db.comment
        .findMany({
          where: { projectId, threadType, threadId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: authorInclude,
        })
        .then((rows) => rows.map(toCommentRow))
    },

    createComment(input) {
      return db.comment
        .create({
          data: {
            projectId: input.projectId,
            threadType: input.threadType,
            threadId: input.threadId,
            authorId: input.authorId,
            body: input.body,
            needsAnswer: input.needsAnswer,
          },
          include: authorInclude,
        })
        .then(toCommentRow)
    },

    findCommentById(commentId) {
      return db.comment
        .findUnique({ where: { id: commentId }, include: authorInclude })
        .then((row) => (row ? toCommentRow(row) : null))
    },

    updateCommentBody(commentId, body) {
      return db.comment
        .update({ where: { id: commentId }, data: { body }, include: authorInclude })
        .then(toCommentRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteComment(commentId) {
      return db.comment
        .delete({ where: { id: commentId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    async threadBelongsToProject(threadType, threadId, projectId) {
      const info = await threadInfoQueries[threadType](threadId)
      return info !== null && info.projectId === projectId
    },

    async findThreadInfo(threadType, threadId) {
      const info = await threadInfoQueries[threadType](threadId)
      if (!info) return null
      return { ...info, threadType, threadId, route: ROUTE_BY_THREAD[threadType] }
    },

    listAccessibleProjects(userId, orgRole) {
      const team = orgRole === 'owner' || orgRole === 'manager' || orgRole === 'analyst'
      return db.project.findMany({
        where: team ? {} : { members: { some: { userId } } },
        select: { id: true, name: true, client: true },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      }) as Promise<ProjectRefRow[]>
    },

    async listUnreadComments(userId, projectIds) {
      // Тот же критерий, что countUnreadComments проектов: новее ThreadRead, не от себя.
      const rows = await db.$queryRaw<PrismaCommentRow[]>(Prisma.sql`
        SELECT c.id, c.project_id AS "projectId", c.thread_type AS "threadType", c.thread_id AS "threadId",
               c.author_id AS "authorId", c.body, c.needs_answer AS "needsAnswer",
               c.created_at AS "createdAt", c.updated_at AS "updatedAt",
               json_build_object('email', u.email, 'displayName', u.display_name) AS author
        FROM comments c
        JOIN users u ON u.id = c.author_id
        LEFT JOIN thread_reads tr
          ON tr.user_id = ${userId} AND tr.thread_type = c.thread_type AND tr.thread_id = c.thread_id
        WHERE c.project_id IN (${Prisma.join(projectIds)})
          AND c.author_id <> ${userId}
          AND (tr.last_read_at IS NULL OR c.created_at > tr.last_read_at)
        ORDER BY c.created_at DESC
        LIMIT 200`)
      return rows.map(toCommentRow)
    },

    async upsertThreadRead(userId, threadType, threadId, lastReadAt) {
      await db.threadRead.upsert({
        where: {
          userId_threadType_threadId: { userId, threadType, threadId },
        },
        create: { userId, threadType, threadId, lastReadAt },
        update: { lastReadAt },
      })
    },
  }
}

function isRecordNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}