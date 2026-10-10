import { randomUUID } from 'node:crypto'

import type { MiddlewareHandler } from 'hono'

import type { TaskDeferrer } from '../../background-tasks'
import type { DbClient } from '../../db'
import { assertSafeObjectKey, type PrivateStorage } from '../../storage'
import type { AuthHttpEnv } from '../auth'
import type { ProjectAccessGuard } from '../projects'
import { ProcessesService } from './application/processes-service'
import { createProcessSchemeUploadTokens } from './infrastructure/process-scheme-upload-tokens'
import { createPrismaProcessesRepository } from './infrastructure/processes-repository'
import { createProcessRoutes } from './transport/process-routes'

type CreateProcessesModuleOptions = {
  backgroundTasks: TaskDeferrer
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  /** Права проекта считает projects-модуль; processes переиспользует тот же guard. */
  guard: ProjectAccessGuard
  storage: PrivateStorage
  /** Основа для подписи тикетов загрузки схем. */
  jwtSecret: string
}

/**
 * Модуль обследования B3: процессы AS-IS/TO-BE со шагами (mapTo/disappears) и схемами
 * StormBPMN в приватном хранилище. Доступ — edit для команды, view для всех ролей проекта.
 */
export function createProcessesModule({
  backgroundTasks,
  db,
  requireAuth,
  guard,
  storage,
  jwtSecret,
}: CreateProcessesModuleOptions) {
  const repository = createPrismaProcessesRepository(db)
  // Замена/удаление схемы чистит хранилище после ответа: сбой удаления не должен ронять
  // запрос, который база уже закоммитила (тот же размен, что у фактов).
  const deferDelete = (objectKey: string) => {
    backgroundTasks.defer(() => storage.deleteObject(objectKey))
  }

  const processesService = new ProcessesService({
    clock: { now: () => new Date() },
    guard,
    repository,
    storage,
    tokens: createProcessSchemeUploadTokens(jwtSecret),
    // Ключ детерминирован по процессу и стороне, uuid-хвост делает его write-once
    // (If-None-Match: * в подписи) и позволяет замену без удаления старого объекта.
    createObjectKey: (projectId, processId, side) =>
      assertSafeObjectKey(['projects', projectId, 'processes', processId, side, randomUUID()].join('/')),
    deferDelete,
  })

  return {
    services: { processesService },
    routes: [createProcessRoutes({ requireAuth, service: processesService })],
  }
}
