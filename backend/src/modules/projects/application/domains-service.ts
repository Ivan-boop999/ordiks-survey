import type {
  ChecklistItemDto,
  CreateChecklistItemRequest,
  CreateDomainGroupRequest,
  CreateDomainRequest,
  DomainDto,
  DomainGroupDto,
  UpdateChecklistItemRequest,
  UpdateDomainGroupRequest,
  UpdateDomainRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import { ProjectsFailure } from '../domain/errors'
import type { ProjectAccessGuard } from './access-guard'
import type {
  ChecklistItemRow,
  DomainGroupTreeRow,
  ProjectsRepository,
} from './ports'

type DomainsServiceDependencies = {
  guard: ProjectAccessGuard
  repository: ProjectsRepository
}

/**
 * Группы направлений, домены и чек-листы покрытия. Статус домена пересчитывается по чек-листу
 * при каждой его правке (см. domain/checklist.ts), ручная установка статуса тоже доступна.
 */
export class DomainsService {
  constructor(private readonly dependencies: DomainsServiceDependencies) {}

  async listDomainTree(principal: AuthenticatedPrincipal, projectId: string): Promise<DomainGroupDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listDomainTree(projectId)).map(groupDto)
  }

  async createDomainGroup(principal: AuthenticatedPrincipal, projectId: string, input: CreateDomainGroupRequest) {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const row = await this.dependencies.repository.createDomainGroup({
      projectId,
      name: input.name,
      sortOrder: input.sortOrder ?? (await this.nextGroupOrder(projectId)),
    })
    return groupDto({ ...row, domains: [] })
  }

  async updateDomainGroup(principal: AuthenticatedPrincipal, groupId: string, input: UpdateDomainGroupRequest) {
    const group = await this.findGroup(groupId)
    await this.dependencies.guard.requireEdit(principal.id, group.projectId)
    const row = await this.dependencies.repository.updateDomainGroup(groupId, { ...input })
    return groupDto({
      ...(row ?? group),
      domains: (await this.dependencies.repository.listDomainTree(group.projectId))
        .find((candidate) => candidate.id === groupId)?.domains ?? [],
    })
  }

  async deleteDomainGroup(principal: AuthenticatedPrincipal, groupId: string) {
    const group = await this.findGroup(groupId)
    await this.dependencies.guard.requireEdit(principal.id, group.projectId)
    await this.dependencies.repository.deleteDomainGroup(groupId)
  }

  async createDomain(principal: AuthenticatedPrincipal, projectId: string, input: CreateDomainRequest) {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const group = await this.dependencies.repository.findDomainGroupById(input.groupId)
    if (!group || group.projectId !== projectId) {
      throw new ProjectsFailure('invalid', 'Domain group does not belong to this project')
    }
    if (input.ownerId != null) {
      await this.assertOwnerIsUser(input.ownerId)
    }

    const row = await this.dependencies.repository.createDomain({
      projectId,
      groupId: input.groupId,
      ownerId: input.ownerId ?? null,
      name: input.name,
      sortOrder: input.sortOrder ?? (await this.nextDomainOrder(projectId, input.groupId)),
      status: 'not_started',
      checklist: input.checklist,
    })
    return domainDto(row)
  }

  async updateDomain(principal: AuthenticatedPrincipal, domainId: string, input: UpdateDomainRequest) {
    const domain = await this.findDomain(domainId)
    await this.dependencies.guard.requireEdit(principal.id, domain.projectId)
    if (input.groupId !== undefined) {
      const group = await this.dependencies.repository.findDomainGroupById(input.groupId)
      if (!group || group.projectId !== domain.projectId) {
        throw new ProjectsFailure('invalid', 'Domain group does not belong to this project')
      }
    }
    if (input.ownerId != null) {
      await this.assertOwnerIsUser(input.ownerId)
    }

    // nullish-поля как есть: undefined — «не менять», null — «отвязать владельца».
    const row = await this.dependencies.repository.updateDomain(domainId, { ...input })
    return domainDto(row ?? { ...domain, checklist: [] })
  }

  async deleteDomain(principal: AuthenticatedPrincipal, domainId: string) {
    const domain = await this.findDomain(domainId)
    await this.dependencies.guard.requireEdit(principal.id, domain.projectId)
    await this.dependencies.repository.deleteDomain(domainId)
  }

  async createChecklistItem(principal: AuthenticatedPrincipal, domainId: string, input: CreateChecklistItemRequest) {
    const domain = await this.findDomain(domainId)
    await this.dependencies.guard.requireEdit(principal.id, domain.projectId)
    return itemDto(await this.dependencies.repository.createChecklistItem({
      domainId,
      text: input.text,
      done: input.done ?? false,
      sortOrder: input.sortOrder ?? 0,
    }))
  }

  async updateChecklistItem(principal: AuthenticatedPrincipal, itemId: string, input: UpdateChecklistItemRequest) {
    const item = await this.findItem(itemId)
    await this.dependencies.guard.requireEdit(principal.id, item.domain.projectId)
    const row = await this.dependencies.repository.updateChecklistItem(itemId, { ...input })
    return itemDto(row ?? item)
  }

  async deleteChecklistItem(principal: AuthenticatedPrincipal, itemId: string) {
    const item = await this.findItem(itemId)
    await this.dependencies.guard.requireEdit(principal.id, item.domain.projectId)
    await this.dependencies.repository.deleteChecklistItem(itemId)
  }

  private async assertOwnerIsUser(ownerId: string) {
    const owner = await this.dependencies.repository.findUserById(ownerId)
    if (!owner) throw new ProjectsFailure('invalid', 'Domain owner user not found')
  }

  private async nextGroupOrder(projectId: string): Promise<number> {
    const tree = await this.dependencies.repository.listDomainTree(projectId)
    return tree.reduce((maximum, group) => Math.max(maximum, group.sortOrder + 1), 0)
  }

  private async nextDomainOrder(projectId: string, groupId: string): Promise<number> {
    const tree = await this.dependencies.repository.listDomainTree(projectId)
    const group = tree.find((candidate) => candidate.id === groupId)
    return (group?.domains ?? []).reduce((maximum, domain) => Math.max(maximum, domain.sortOrder + 1), 0)
  }

  private async findGroup(groupId: string) {
    const group = await this.dependencies.repository.findDomainGroupById(groupId)
    if (!group) throw new ProjectsFailure('not_found', 'Domain group not found')
    return group
  }

  private async findDomain(domainId: string) {
    const domain = await this.dependencies.repository.findDomainById(domainId)
    if (!domain) throw new ProjectsFailure('not_found', 'Domain not found')
    return domain
  }

  private async findItem(itemId: string) {
    const item = await this.dependencies.repository.findChecklistItemById(itemId)
    if (!item) throw new ProjectsFailure('not_found', 'Checklist item not found')
    return item
  }
}

function groupDto(row: DomainGroupTreeRow): DomainGroupDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    sortOrder: row.sortOrder,
    domains: row.domains.map(domainDto),
  }
}

function domainDto(row: DomainDtoRow): DomainDto {
  return {
    id: row.id,
    projectId: row.projectId,
    groupId: row.groupId,
    ownerId: row.ownerId,
    name: row.name,
    status: row.status,
    sortOrder: row.sortOrder,
    checklist: (row.checklist ?? []).map(itemDto),
  }
}

type DomainDtoRow = {
  id: string
  projectId: string
  groupId: string
  ownerId: string | null
  name: string
  status: DomainDto['status']
  sortOrder: number
  checklist?: ChecklistItemRow[]
}

function itemDto(row: ChecklistItemRow): ChecklistItemDto {
  return {
    id: row.id,
    domainId: row.domainId,
    text: row.text,
    done: row.done,
    sortOrder: row.sortOrder,
  }
}
