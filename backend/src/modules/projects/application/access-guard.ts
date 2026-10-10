import type { ProjectAccess } from '@ordiks-survey/contracts'

import { accessFor, type ProjectAccessContext } from '../domain/access'
import { ProjectsFailure } from '../domain/errors'
import type { ProjectsRepository } from './ports'

/**
 * Единая точка проверки доступа к проекту для всех сервисов модуля. Проект, которого нет,
 * неотличим от запрещённого: NOT_FOUND и без членства, и без прав.
 */
export class ProjectAccessGuard {
  constructor(private readonly repository: Pick<ProjectsRepository, 'findAccessContext'>) {}

  async context(userId: string, projectId: string): Promise<ProjectAccessContext & ProjectAccess> {
    const context = await this.repository.findAccessContext(userId, projectId)
    if (!context) {
      throw new ProjectsFailure('not_found', 'Project not found')
    }
    return { ...context, ...accessFor(context) }
  }

  async requireView(userId: string, projectId: string): Promise<ProjectAccess> {
    const context = await this.context(userId, projectId)
    if (!context.view) {
      throw new ProjectsFailure('forbidden', 'You do not have access to this project')
    }
    return context
  }

  async requireEdit(userId: string, projectId: string): Promise<ProjectAccess> {
    const context = await this.context(userId, projectId)
    if (!context.edit) {
      throw new ProjectsFailure('forbidden', 'Only the Ordiks team can edit this project')
    }
    return context
  }
}
