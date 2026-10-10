import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import type { ProjectAccessGuard } from '../projects'
import { CommentsService } from './application/comments-service'
import { NotificationsService } from './application/notifications-service'
import { createPrismaCollaborationRepository } from './infrastructure/collaboration-repository'
import { createCollaborationRoutes } from './transport/collaboration-routes'

type CreateCollaborationModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  /** Права проекта считает projects-модуль; collaboration переиспользует тот же guard. */
  guard: ProjectAccessGuard
}

/**
 * Модуль обследования B3: комментарии-треды по объектам проекта и центр уведомлений
 * (непрочитанные комментарии в доступных проектах, гасятся ThreadRead при открытии треда).
 */
export function createCollaborationModule({ db, requireAuth, guard }: CreateCollaborationModuleOptions) {
  const repository = createPrismaCollaborationRepository(db)
  const clock = { now: () => new Date() }
  const commentsService = new CommentsService({ clock, guard, repository })
  const notificationsService = new NotificationsService({ clock, guard, repository })

  return {
    services: { commentsService, notificationsService },
    routes: [
      createCollaborationRoutes({ requireAuth, commentsService, notificationsService }),
    ],
  }
}
