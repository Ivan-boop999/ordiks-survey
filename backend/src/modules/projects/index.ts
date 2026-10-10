import type { MiddlewareHandler } from 'hono'

import type { DbClient } from '../../db'
import type { AuthHttpEnv } from '../auth'
import { ProjectAccessGuard } from './application/access-guard'
import { DomainsService } from './application/domains-service'
import { PlanService } from './application/plan-service'
import { ProjectsService } from './application/projects-service'
import { TemplatesService } from './application/templates-service'
import { createPrismaProjectsRepository } from './infrastructure/projects-repository'
import { createPrismaTemplatesRepository } from './infrastructure/templates-repository'
import { createDomainRoutes } from './transport/domain-routes'
import { createPlanRoutes } from './transport/plan-routes'
import { createProjectRoutes } from './transport/project-routes'
import { createTemplateRoutes } from './transport/template-routes'

type CreateProjectsModuleOptions = {
  db: DbClient
  requireAuth: MiddlewareHandler<AuthHttpEnv>
}

/**
 * Модуль обследования: проекты, состав, этапы/задачи, домены с чек-листами и библиотека
 * методик (шаблоны проектов). Все маршруты монтируются под /api; права вычисляет
 * resolveProjectAccess (guard + repository).
 */
export function createProjectsModule({ db, requireAuth }: CreateProjectsModuleOptions) {
  const repository = createPrismaProjectsRepository(db)
  const guard = new ProjectAccessGuard(repository)
  const projectsService = new ProjectsService({ clock: { now: () => new Date() }, guard, repository })
  const planService = new PlanService({ clock: { now: () => new Date() }, guard, repository })
  const domainsService = new DomainsService({ guard, repository })
  const templatesService = new TemplatesService({
    guard,
    repository: createPrismaTemplatesRepository(db),
    projectsService,
  })

  return {
    guard,
    services: { domainsService, planService, projectsService, templatesService },
    routes: [
      createProjectRoutes({ requireAuth, service: projectsService }),
      createPlanRoutes({ requireAuth, service: planService }),
      createDomainRoutes({ requireAuth, service: domainsService }),
      createTemplateRoutes({ requireAuth, service: templatesService }),
    ],
  }
}

export { accessFor, canEditProject, canViewProject, isTeamOrgRole, canManageMembers } from './domain/access'
export type { ProjectAccessContext } from './domain/access'
export { ProjectAccessGuard } from './application/access-guard'
// Survey-модуль потребляет guard и должен интерпретировать его отказы теми же кодами.
export { ProjectsFailure, type ProjectsFailureKind } from './domain/errors'
