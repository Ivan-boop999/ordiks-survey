import { randomUUID } from 'node:crypto'

import type { MiddlewareHandler } from 'hono'

import type { TaskDeferrer } from '../../background-tasks'
import type { DbClient } from '../../db'
import { assertSafeObjectKey, type PrivateStorage } from '../../storage'
import type { AuthHttpEnv } from '../auth'
import type { ProjectAccessGuard } from '../projects'
import { FactsService } from './application/facts-service'
import { FindingsService } from './application/findings-service'
import { GuidesService } from './application/guides-service'
import { InterviewsService } from './application/interviews-service'
import { RequestsService } from './application/requests-service'
import { createFactUploadTokens } from './infrastructure/fact-upload-tokens'
import { createPrismaSurveyRepository } from './infrastructure/survey-repository'
import { createFactRoutes } from './transport/fact-routes'
import { createFindingRoutes } from './transport/finding-routes'
import { createGuideRoutes } from './transport/guide-routes'
import { createInterviewRoutes } from './transport/interview-routes'
import { createRequestRoutes } from './transport/request-routes'

type CreateSurveyModuleOptions = {
  backgroundTasks: TaskDeferrer
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  /** Права проекта считает projects-модуль; survey переиспользует тот же guard. */
  guard: ProjectAccessGuard
  storage: PrivateStorage
  /** Основа для подписи тикетов загрузки файлов фактов. */
  jwtSecret: string
}

/**
 * Модуль обследования B2: факты (с файлами в приватном хранилище), гайды с условными вопросами,
 * интервью с ответами, запросы данных, находки. Маршруты монтируются под /api; доступ — через
 * guard из модуля projects (edit = команда ОРДИКС, view = членство, 404 посторонним).
 */
export function createSurveyModule({
  backgroundTasks,
  db,
  requireAuth,
  guard,
  storage,
  jwtSecret,
}: CreateSurveyModuleOptions) {
  const repository = createPrismaSurveyRepository(db)
  const clock = { now: () => new Date() }
  // Замена/удаление файла чистит хранилище после ответа: сбой удаления не должен ронять
  // запрос, который база уже закоммитила (тот же размен, что у аватаров).
  const deferDelete = (objectKey: string) => {
    backgroundTasks.defer(() => storage.deleteObject(objectKey))
  }

  const factsService = new FactsService({
    clock,
    guard,
    repository,
    storage,
    tokens: createFactUploadTokens(jwtSecret),
    createObjectKey: (projectId) =>
      assertSafeObjectKey(['projects', projectId, 'facts', randomUUID()].join('/')),
    deferDelete,
  })
  const guidesService = new GuidesService({ guard, repository })
  const interviewsService = new InterviewsService({ guard, repository })
  const requestsService = new RequestsService({ clock, guard, repository })
  const findingsService = new FindingsService({ guard, repository })

  return {
    services: { factsService, findingsService, guidesService, interviewsService, requestsService },
    routes: [
      createFactRoutes({ requireAuth, service: factsService }),
      createGuideRoutes({ requireAuth, service: guidesService }),
      createInterviewRoutes({ requireAuth, service: interviewsService }),
      createRequestRoutes({ requireAuth, service: requestsService }),
      createFindingRoutes({ requireAuth, service: findingsService }),
    ],
  }
}
