import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import type { ProjectAccessGuard } from '../projects'
import { ReportService } from './application/report-service'
import { createPrismaReportRepository } from './infrastructure/report-repository'
import { createReportRoutes } from './transport/report-routes'

type CreateReportingModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
  /** Права проекта считает projects-модуль; отчёт переиспользует тот же guard. */
  guard: ProjectAccessGuard
}

/**
 * Модуль обследования B3: отчёт — разделы с санитизированным HTML, автовставки таблиц
 * (находки/запросы/покрытие/свой реестр/риски), визы разделов и сводка готовности.
 */
export function createReportingModule({ db, requireAuth, guard }: CreateReportingModuleOptions) {
  const reportService = new ReportService({
    clock: { now: () => new Date() },
    guard,
    repository: createPrismaReportRepository(db),
  })

  return {
    services: { reportService },
    routes: [createReportRoutes({ requireAuth, service: reportService })],
  }
}
