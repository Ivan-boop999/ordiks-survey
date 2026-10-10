import type {
  ApprovalDecision,
  CreateReportSectionRequest,
  ProjectReportDto,
  ReportInsertRequest,
  ReportSectionDto,
  SectionApprovalRequest,
  UpdateReportSectionRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import { ReportingFailure } from '../domain/errors'
import {
  coverageTableHtml,
  findingsTableHtml,
  registryTableHtml,
  requestsTableHtml,
  risksTableHtml,
} from '../domain/inserts'
import { sanitizeReportHtml } from '../domain/sanitize'
import type { Clock, ReportRepository, ReportSectionRow } from './ports'

type ReportServiceDependencies = {
  clock: Clock
  guard: ProjectAccessGuard
  repository: ReportRepository
}

/**
 * Отчёт: разделы с HTML-телом (санитизация белым списком при каждом сохранении), серверные
 * автовставки (находки домена, открытые запросы, покрытие, свой реестр, риски), визы
 * (client_lead/client_staff и команда; повторная перезаписывается) и сводка готовности.
 */
export class ReportService {
  constructor(private readonly dependencies: ReportServiceDependencies) {}

  async getReport(principal: AuthenticatedPrincipal, projectId: string): Promise<ProjectReportDto> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    const sections = (await this.dependencies.repository.listSections(projectId)).map(sectionDto)
    const readiness = await this.readiness(sections, projectId)
    return { sections, readiness }
  }

  async getSection(principal: AuthenticatedPrincipal, sectionId: string): Promise<ReportSectionDto> {
    const section = await this.findSection(sectionId)
    await this.dependencies.guard.requireView(principal.id, section.projectId)
    return sectionDto(section)
  }

  async createSection(principal: AuthenticatedPrincipal, projectId: string, input: CreateReportSectionRequest): Promise<ReportSectionDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const sortOrder = input.sortOrder ?? (await this.dependencies.repository.listSections(projectId)).length
    const created = await this.dependencies.repository.createSection(projectId, {
      title: input.title,
      body: sanitizeReportHtml(input.body),
      sortOrder,
    })
    const section = await this.dependencies.repository.findSectionById(created.id)
    if (!section) throw new ReportingFailure('conflict', 'Report section disappeared')
    return sectionDto(section)
  }

  async updateSection(principal: AuthenticatedPrincipal, sectionId: string, input: UpdateReportSectionRequest): Promise<ReportSectionDto> {
    const section = await this.findSection(sectionId)
    await this.dependencies.guard.requireEdit(principal.id, section.projectId)

    const contentChanged =
      (input.title !== undefined && input.title !== section.title) ||
      (input.body !== undefined && sanitizeReportHtml(input.body) !== section.body)
    await this.dependencies.repository.updateSection(sectionId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: sanitizeReportHtml(input.body) } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    })
    // Содержимое изменилось — прежние визы больше не о чём не говорят (invalidateApprovals).
    if (contentChanged) await this.dependencies.repository.deleteApprovals(sectionId)

    const updated = await this.dependencies.repository.findSectionById(sectionId)
    return sectionDto(updated ?? section)
  }

  async deleteSection(principal: AuthenticatedPrincipal, sectionId: string): Promise<void> {
    const section = await this.findSection(sectionId)
    await this.dependencies.guard.requireEdit(principal.id, section.projectId)
    await this.dependencies.repository.deleteSection(sectionId)
  }

  // --------------------------------------------------------
  // Визы
  // --------------------------------------------------------

  /** Визировать могут все роли с правом комментария: команда + client_lead/client_staff. */
  async approve(principal: AuthenticatedPrincipal, sectionId: string, input: SectionApprovalRequest): Promise<ReportSectionDto> {
    const section = await this.findSection(sectionId)
    const access = await this.dependencies.guard.context(principal.id, section.projectId)
    if (!access.comment) {
      // Наблюдатель знает о разделе — честный 403; постороннему — 404.
      throw new ReportingFailure(
        access.view ? 'forbidden' : 'not_found',
        access.view ? 'Observers cannot approve report sections' : 'Report section not found',
      )
    }
    await this.dependencies.repository.upsertApproval(sectionId, principal.id, input.decision, input.comment)
    const updated = await this.dependencies.repository.findSectionById(sectionId)
    if (!updated) throw new ReportingFailure('conflict', 'Report section disappeared')
    return sectionDto(updated)
  }

  // --------------------------------------------------------
  // Автовставки
  // --------------------------------------------------------

  /** Сервер собирает HTML-таблицу и дописывает в конец body; правка обнуляет визы. */
  async insert(principal: AuthenticatedPrincipal, projectId: string, input: ReportInsertRequest): Promise<ReportSectionDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    const section = await this.findSection(input.sectionId)
    if (section.projectId !== projectId) {
      throw new ReportingFailure('invalid', 'Section does not belong to this project')
    }

    const html = await this.buildInsertHtml(projectId, input)
    const body = `${section.body ? `${section.body}\n` : ''}${html}`
    await this.dependencies.repository.updateSection(section.id, { body })
    await this.dependencies.repository.deleteApprovals(section.id)

    const updated = await this.dependencies.repository.findSectionById(section.id)
    if (!updated) throw new ReportingFailure('conflict', 'Report section disappeared')
    return sectionDto(updated)
  }

  private async buildInsertHtml(projectId: string, input: ReportInsertRequest): Promise<string> {
    switch (input.kind) {
      case 'findings': {
        const domain = await this.dependencies.repository.findDomainById(input.domainId!)
        if (!domain || domain.projectId !== projectId) {
          throw new ReportingFailure('invalid', 'Domain does not belong to this project')
        }
        const findings = await this.dependencies.repository.listFindingsOfDomain(projectId, domain.id)
        if (findings.length === 0) throw new ReportingFailure('invalid', 'This domain has no findings')
        const settings = await this.requireSettings(projectId)
        return findingsTableHtml(domain.name, findings, settings)
      }
      case 'requests': {
        const requests = await this.dependencies.repository.listOpenRequests(projectId)
        if (requests.filter((request) => request.status !== 'received').length === 0) {
          throw new ReportingFailure('invalid', 'No open requests')
        }
        return requestsTableHtml(requests, this.dependencies.clock.now())
      }
      case 'coverage': {
        const groups = await this.dependencies.repository.listCoverage(projectId)
        if (groups.length === 0) throw new ReportingFailure('invalid', 'Project has no domains')
        return coverageTableHtml(groups)
      }
      case 'risks': {
        const risks = await this.dependencies.repository.listRisks(projectId)
        if (risks.length === 0) throw new ReportingFailure('invalid', 'Project has no risks')
        return risksTableHtml(risks)
      }
      case 'registry': {
        const registry = await this.dependencies.repository.findRegistryTree(input.registryId!)
        if (!registry || registry.projectId !== projectId) {
          throw new ReportingFailure('invalid', 'Registry does not belong to this project')
        }
        if (registry.entries.length === 0) throw new ReportingFailure('invalid', 'Registry has no entries')
        return registryTableHtml(registry)
      }
      default:
        throw new ReportingFailure('invalid', 'Unknown insert kind')
    }
  }

  // --------------------------------------------------------
  // Сводка готовности
  // --------------------------------------------------------

  /**
   * Раздел согласован, если есть visa ok от клиентской роли и ни одной changes от них
   * (прототип: obsDone/vdone). «Кто ждёт» — клиенты, не завизировавшие разделы.
   */
  private async readiness(sections: ReportSectionDto[], projectId: string): Promise<ProjectReportDto['readiness']> {
    const approvers = await this.dependencies.repository.listClientApprovers(projectId)
    const approverIds = new Set(approvers.map((approver) => approver.userId))

    let agreed = 0
    let withIssues = 0
    const pendingCount = new Map<string, number>(approvers.map((approver) => [approver.userId, 0]))

    for (const section of sections) {
      const clientVisas = section.approvals.filter((approval) => approverIds.has(approval.userId))
      const approved = clientVisas.some((visa) => visa.decision === 'approved')
      const changes = clientVisas.some((visa) => visa.decision === 'changes')
      if (changes) withIssues += 1
      else if (approved) agreed += 1

      for (const approver of approvers) {
        const visaed = clientVisas.some((visa) => visa.userId === approver.userId)
        if (!visaed) pendingCount.set(approver.userId, (pendingCount.get(approver.userId) ?? 0) + 1)
      }
    }

    return {
      sections: sections.length,
      agreed,
      withIssues,
      pending: approvers
        .map((approver) => ({
          userId: approver.userId,
          displayName: approver.displayName,
          sections: pendingCount.get(approver.userId) ?? 0,
        }))
        .filter((entry) => entry.sections > 0),
    }
  }

  private async requireSettings(projectId: string) {
    const settings = await this.dependencies.repository.findProjectSettings(projectId)
    if (!settings) throw new ReportingFailure('not_found', 'Project not found')
    return settings
  }

  private async findSection(sectionId: string): Promise<ReportSectionRow> {
    const section = await this.dependencies.repository.findSectionById(sectionId)
    if (!section) throw new ReportingFailure('not_found', 'Report section not found')
    return section
  }
}

export function sectionDto(row: ReportSectionRow): ReportSectionDto {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    body: row.body,
    sortOrder: row.sortOrder,
    approvals: row.approvals.map((approval) => ({
      userId: approval.userId,
      email: approval.email,
      displayName: approval.displayName,
      decision: approval.decision,
      comment: approval.comment,
      createdAt: approval.createdAt.toISOString(),
      updatedAt: approval.updatedAt.toISOString(),
    })),
  }
}
