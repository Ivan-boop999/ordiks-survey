import type {
  BulkUpdateFindingsRequest,
  BulkUpdateFindingsResponse,
  CreateFindingRequest,
  FindingDto,
  FindingsQuery,
  UpdateFindingRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import {
  checkFindingAgainstDictionaries,
  defaultFindingWrite,
  findingDictionaries,
} from '../domain/dictionaries'
import { SurveyFailure } from '../domain/errors'
import type { FindingRow, SurveyRepository } from './ports'

type FindingsServiceDependencies = {
  guard: ProjectAccessGuard
  repository: SurveyRepository
}

/**
 * Находки (реестр проблем): категория/приоритет/статус — строки из справочников проекта
 * (settings) с дефолтами прототипа как фолбэком. CRUD — команда; чтение — все роли проекта.
 */
export class FindingsService {
  constructor(private readonly dependencies: FindingsServiceDependencies) {}

  async listFindings(principal: AuthenticatedPrincipal, projectId: string, query: FindingsQuery): Promise<FindingDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listFindings(projectId, query)).map(findingDto)
  }

  async getFinding(principal: AuthenticatedPrincipal, findingId: string): Promise<FindingDto> {
    const finding = await this.findFinding(findingId)
    await this.dependencies.guard.requireView(principal.id, finding.projectId)
    return findingDto(finding)
  }

  async createFinding(principal: AuthenticatedPrincipal, projectId: string, input: CreateFindingRequest): Promise<FindingDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const dictionaries = await this.requireDictionaries(projectId)

    const defaults = defaultFindingWrite(dictionaries)
    const write = {
      category: input.category ?? defaults.category,
      priority: input.priority ?? defaults.priority,
      status: input.status ?? defaults.status,
    }
    this.assertDictionaries(dictionaries, write)
    await this.assertLinks(projectId, input.domainId ?? null, input.factId ?? null, input.ownerId ?? null)

    const row = await this.dependencies.repository.createFinding({
      projectId,
      domainId: input.domainId ?? null,
      factId: input.factId ?? null,
      ownerId: input.ownerId ?? null,
      title: input.title,
      description: input.description,
      ...write,
    })
    return findingDto(row)
  }

  async updateFinding(principal: AuthenticatedPrincipal, findingId: string, input: UpdateFindingRequest): Promise<FindingDto> {
    const finding = await this.findFinding(findingId)
    await this.dependencies.guard.requireEdit(principal.id, finding.projectId)
    const dictionaries = await this.requireDictionaries(finding.projectId)

    if (input.category !== undefined || input.priority !== undefined || input.status !== undefined) {
      this.assertDictionaries(dictionaries, {
        category: input.category ?? finding.category,
        priority: input.priority ?? finding.priority,
        status: input.status ?? finding.status,
      })
    }
    const domainId = input.domainId === undefined ? finding.domainId : input.domainId ?? null
    const factId = input.factId === undefined ? finding.factId : input.factId ?? null
    const ownerId = input.ownerId === undefined ? finding.ownerId : input.ownerId ?? null
    await this.assertLinks(finding.projectId, domainId, factId, ownerId)

    const row = await this.dependencies.repository.updateFinding(findingId, {
      ...input,
      domainId,
      factId,
      ownerId,
    })
    return findingDto(row ?? finding)
  }

  async deleteFinding(principal: AuthenticatedPrincipal, findingId: string): Promise<void> {
    const finding = await this.findFinding(findingId)
    await this.dependencies.guard.requireEdit(principal.id, finding.projectId)
    await this.dependencies.repository.deleteFinding(findingId)
  }

  /** Массовая смена статуса — только команда; id из чужих проектов молча пропускаются. */
  async bulkUpdateStatus(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: BulkUpdateFindingsRequest,
  ): Promise<BulkUpdateFindingsResponse> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const dictionaries = await this.requireDictionaries(projectId)
    const check = checkFindingAgainstDictionaries(dictionaries, { status: input.status })
    if (!check.ok) throw new SurveyFailure('invalid', check.message)

    const updated = await this.dependencies.repository.bulkUpdateFindingStatus(
      projectId,
      input.ids,
      input.status,
    )
    return { updated }
  }

  private async requireDictionaries(projectId: string) {
    const settings = await this.dependencies.repository.findProjectSettings(projectId)
    if (!settings) throw new SurveyFailure('not_found', 'Project not found')
    return findingDictionaries(settings)
  }

  private assertDictionaries(
    dictionaries: ReturnType<typeof findingDictionaries>,
    value: { category: string; priority: string; status: string },
  ) {
    const check = checkFindingAgainstDictionaries(dictionaries, value)
    if (!check.ok) throw new SurveyFailure('invalid', check.message)
  }

  private async assertLinks(projectId: string, domainId: string | null, factId: string | null, ownerId: string | null) {
    if (domainId != null) {
      const domain = await this.dependencies.repository.findDomainById(domainId)
      if (!domain || domain.projectId !== projectId) {
        throw new SurveyFailure('invalid', 'Domain does not belong to this project')
      }
    }
    if (factId != null) {
      const fact = await this.dependencies.repository.findFactByIdForProject(projectId, factId)
      if (!fact) throw new SurveyFailure('invalid', 'Fact does not belong to this project')
    }
    if (ownerId != null) {
      const memberRole = await this.dependencies.repository.findMemberRole(projectId, ownerId)
      if (memberRole === null) {
        throw new SurveyFailure('invalid', 'Owner must be a member of this project')
      }
    }
  }

  private async findFinding(findingId: string): Promise<FindingRow> {
    const finding = await this.dependencies.repository.findFindingById(findingId)
    if (!finding) throw new SurveyFailure('not_found', 'Finding not found')
    return finding
  }
}

export function findingDto(row: FindingRow): FindingDto {
  return {
    id: row.id,
    projectId: row.projectId,
    domainId: row.domainId,
    factId: row.factId,
    ownerId: row.ownerId,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
