import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import type { ProjectAccessGuard } from '../projects'
import { AnalyticsService } from './application/analytics-service'
import { CustomRegistriesService } from './application/custom-registries-service'
import { createPrismaAnalyticsRepository, createPrismaRegistriesRepository } from './infrastructure/registries-repository'
import { createAnalyticsRoutes } from './transport/analytics-routes'
import { createRegistryRoutes } from './transport/registry-routes'

type CreateRegistriesModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  /** Права проекта считает projects-модуль; реестры переиспользуют тот же guard. */
  guard: ProjectAccessGuard
}

/**
 * Модуль обследования B3: аналитические реестры (GAP, риски с критичностью, требования
 * MoSCoW, решения, коммуникации, quick wins, базлайн) и пользовательские реестры
 * (конструктор полей с формулами, статусы, записи, импорт из текста).
 */
export function createRegistriesModule({ db, requireAuth, guard }: CreateRegistriesModuleOptions) {
  const analyticsService = new AnalyticsService({
    guard,
    repository: createPrismaAnalyticsRepository(db),
  })
  const customRegistriesService = new CustomRegistriesService({
    guard,
    repository: createPrismaRegistriesRepository(db),
  })

  return {
    services: { analyticsService, customRegistriesService },
    routes: [
      createAnalyticsRoutes({ requireAuth, service: analyticsService }),
      createRegistryRoutes({ requireAuth, service: customRegistriesService }),
    ],
  }
}

/// Чистый вычислитель формул реестра: нужен автовставке реестра в отчёт (модуль reporting).
export { computeFormulaValue, computeFormulaValues } from './domain/formula'
