import type { MarkThreadReadRequest, NotificationItem } from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import { CollaborationFailure } from '../domain/errors'
import type { Clock, CollaborationRepository } from './ports'

type NotificationsServiceDependencies = {
  clock: Clock
  guard: ProjectAccessGuard
  repository: CollaborationRepository
}

/// Как в прототипе: центр показывает последние 60 событий.
const NOTIFICATIONS_LIMIT = 60

/**
 * Центр уведомлений: комментарии в доступных проектах, новее ThreadRead пользователя и не от
 * него самого. Каждый item — комментарий + объект треда (заголовок и маршрут перехода) +
 * проект. Открытие треда гасит уведомления: POST /api/me/notifications/read.
 */
export class NotificationsService {
  constructor(private readonly dependencies: NotificationsServiceDependencies) {}

  async listNotifications(principal: AuthenticatedPrincipal): Promise<NotificationItem[]> {
    const projects = await this.dependencies.repository.listAccessibleProjects(principal.id, principal.orgRole)
    if (projects.length === 0) return []
    const projectsById = new Map(projects.map((project) => [project.id, project]))

    const comments = await this.dependencies.repository.listUnreadComments(
      principal.id,
      projects.map((project) => project.id),
    )

    const items: NotificationItem[] = []
    for (const comment of comments.slice(0, NOTIFICATIONS_LIMIT)) {
      const project = projectsById.get(comment.projectId)
      if (!project) continue
      const thread = await this.dependencies.repository.findThreadInfo(comment.threadType, comment.threadId)
      if (!thread) continue
      items.push({
        comment: {
          id: comment.id,
          projectId: comment.projectId,
          threadType: comment.threadType,
          threadId: comment.threadId,
          authorId: comment.authorId,
          authorName: comment.authorName,
          authorEmail: comment.authorEmail,
          body: comment.body,
          needsAnswer: comment.needsAnswer,
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
        },
        thread: { threadType: thread.threadType, threadId: thread.threadId, title: thread.title, route: thread.route },
        project: { id: project.id, name: project.name, client: project.client },
      })
    }
    return items
  }

  /** Отметить тред прочитанным (upsert ThreadRead); тред должен быть в доступном проекте. */
  async markThreadRead(principal: AuthenticatedPrincipal, input: MarkThreadReadRequest): Promise<void> {
    const thread = await this.dependencies.repository.findThreadInfo(input.threadType, input.threadId)
    if (!thread) throw new CollaborationFailure('not_found', 'Thread object not found')
    await this.dependencies.guard.requireView(principal.id, thread.projectId)
    await this.dependencies.repository.upsertThreadRead(
      principal.id,
      input.threadType,
      input.threadId,
      this.dependencies.clock.now(),
    )
  }
}
