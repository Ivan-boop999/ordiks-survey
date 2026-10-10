import type {
  BaselinesQuery,
  BaselineDto,
  CommunicationDto,
  CreateBaselineRequest,
  CreateCommunicationRequest,
  CreateDecisionRequest,
  CreateGapRequest,
  CreateQuickWinRequest,
  CreateRequirementRequest,
  CreateRiskRequest,
  DecisionDto,
  GapsQuery,
  GapDto,
  QuickWinsQuery,
  QuickWinDto,
  RequirementsQuery,
  RequirementDto,
  RisksQuery,
  RiskDto,
  UpdateBaselineRequest,
  UpdateCommunicationRequest,
  UpdateDecisionRequest,
  UpdateGapRequest,
  UpdateQuickWinRequest,
  UpdateRequirementRequest,
  UpdateRiskRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import { RegistriesFailure } from '../domain/errors'
import type {
  AnalyticsRepository,
  BaselineRow,
  CommunicationRow,
  DecisionRow,
  GapRow,
  QuickWinRow,
  RequirementRow,
  RiskRow,
} from './ports'

type AnalyticsServiceDependencies = {
  guard: ProjectAccessGuard
  repository: AnalyticsRepository
}

/**
 * Аналитические реестры: GAP, риски (критичность считается в DTO), требования MoSCoW,
 * журнал решений, коммуникации, quick wins, базлайн. CRUD — команда; чтение — все роли
 * проекта; domainId/findingId/ownerId проверяются на принадлежность проекту.
 */
export class AnalyticsService {
  constructor(private readonly dependencies: AnalyticsServiceDependencies) {}

  // --------------------------------------------------------
  // GAP
  // --------------------------------------------------------

  async listGaps(principal: AuthenticatedPrincipal, projectId: string, query: GapsQuery): Promise<GapDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listGaps(projectId))
      .filter((row) => (query.domainId === undefined ? true : row.domainId === query.domainId))
      .filter((row) => (query.status === undefined ? true : row.status === query.status))
      .map(gapDto)
  }

  async getGap(principal: AuthenticatedPrincipal, gapId: string): Promise<GapDto> {
    const row = await this.find(() => this.dependencies.repository.findGapById(gapId), 'GAP')
    await this.dependencies.guard.requireView(principal.id, row.projectId)
    return gapDto(row)
  }

  async createGap(principal: AuthenticatedPrincipal, projectId: string, input: CreateGapRequest): Promise<GapDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    await this.assertLinks(projectId, input.domainId ?? null, input.findingId ?? null)
    return gapDto(
      await this.dependencies.repository.createGap({
        projectId,
        domainId: input.domainId ?? null,
        findingId: input.findingId ?? null,
        requirement: input.requirement,
        kind: input.kind ?? 'std',
        status: input.status ?? 'open',
        comment: input.comment,
      }),
    )
  }

  async updateGap(principal: AuthenticatedPrincipal, gapId: string, input: UpdateGapRequest): Promise<GapDto> {
    const row = await this.find(() => this.dependencies.repository.findGapById(gapId), 'GAP')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    const domainId = input.domainId === undefined ? row.domainId : input.domainId ?? null
    const findingId = input.findingId === undefined ? row.findingId : input.findingId ?? null
    await this.assertLinks(row.projectId, domainId, findingId)
    const updated = await this.dependencies.repository.updateGap(gapId, { ...input, domainId, findingId })
    return gapDto(updated ?? row)
  }

  async deleteGap(principal: AuthenticatedPrincipal, gapId: string): Promise<void> {
    const row = await this.find(() => this.dependencies.repository.findGapById(gapId), 'GAP')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    await this.dependencies.repository.deleteGap(gapId)
  }

  // --------------------------------------------------------
  // Риски
  // --------------------------------------------------------

  async listRisks(principal: AuthenticatedPrincipal, projectId: string, query: RisksQuery): Promise<RiskDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listRisks(projectId))
      .filter((row) => (query.domainId === undefined ? true : row.domainId === query.domainId))
      .filter((row) => (query.status === undefined ? true : row.status === query.status))
      .map(riskDto)
  }

  async getRisk(principal: AuthenticatedPrincipal, riskId: string): Promise<RiskDto> {
    const row = await this.find(() => this.dependencies.repository.findRiskById(riskId), 'Risk')
    await this.dependencies.guard.requireView(principal.id, row.projectId)
    return riskDto(row)
  }

  async createRisk(principal: AuthenticatedPrincipal, projectId: string, input: CreateRiskRequest): Promise<RiskDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    await this.assertLinks(projectId, input.domainId ?? null, null)
    await this.assertOwner(projectId, input.ownerId ?? null)
    return riskDto(
      await this.dependencies.repository.createRisk({
        projectId,
        domainId: input.domainId ?? null,
        ownerId: input.ownerId ?? null,
        title: input.title,
        probability: input.probability ?? 3,
        impact: input.impact ?? 3,
        status: input.status ?? 'open',
        mitigation: input.mitigation,
      }),
    )
  }

  async updateRisk(principal: AuthenticatedPrincipal, riskId: string, input: UpdateRiskRequest): Promise<RiskDto> {
    const row = await this.find(() => this.dependencies.repository.findRiskById(riskId), 'Risk')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    const domainId = input.domainId === undefined ? row.domainId : input.domainId ?? null
    const ownerId = input.ownerId === undefined ? row.ownerId : input.ownerId ?? null
    await this.assertLinks(row.projectId, domainId, null)
    await this.assertOwner(row.projectId, ownerId)
    const updated = await this.dependencies.repository.updateRisk(riskId, { ...input, domainId, ownerId })
    return riskDto(updated ?? row)
  }

  async deleteRisk(principal: AuthenticatedPrincipal, riskId: string): Promise<void> {
    const row = await this.find(() => this.dependencies.repository.findRiskById(riskId), 'Risk')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    await this.dependencies.repository.deleteRisk(riskId)
  }

  // --------------------------------------------------------
  // Требования
  // --------------------------------------------------------

  async listRequirements(principal: AuthenticatedPrincipal, projectId: string, query: RequirementsQuery): Promise<RequirementDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listRequirements(projectId))
      .filter((row) => (query.domainId === undefined ? true : row.domainId === query.domainId))
      .filter((row) => (query.moscow === undefined ? true : row.moscow === query.moscow))
      .map(requirementDto)
  }

  async getRequirement(principal: AuthenticatedPrincipal, requirementId: string): Promise<RequirementDto> {
    const row = await this.find(() => this.dependencies.repository.findRequirementById(requirementId), 'Requirement')
    await this.dependencies.guard.requireView(principal.id, row.projectId)
    return requirementDto(row)
  }

  async createRequirement(principal: AuthenticatedPrincipal, projectId: string, input: CreateRequirementRequest): Promise<RequirementDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    await this.assertLinks(projectId, input.domainId ?? null, input.findingId ?? null)
    return requirementDto(
      await this.dependencies.repository.createRequirement({
        projectId,
        domainId: input.domainId ?? null,
        findingId: input.findingId ?? null,
        title: input.title,
        source: input.source,
        moscow: input.moscow ?? 'should',
      }),
    )
  }

  async updateRequirement(principal: AuthenticatedPrincipal, requirementId: string, input: UpdateRequirementRequest): Promise<RequirementDto> {
    const row = await this.find(() => this.dependencies.repository.findRequirementById(requirementId), 'Requirement')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    const domainId = input.domainId === undefined ? row.domainId : input.domainId ?? null
    const findingId = input.findingId === undefined ? row.findingId : input.findingId ?? null
    await this.assertLinks(row.projectId, domainId, findingId)
    const updated = await this.dependencies.repository.updateRequirement(requirementId, { ...input, domainId, findingId })
    return requirementDto(updated ?? row)
  }

  async deleteRequirement(principal: AuthenticatedPrincipal, requirementId: string): Promise<void> {
    const row = await this.find(() => this.dependencies.repository.findRequirementById(requirementId), 'Requirement')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    await this.dependencies.repository.deleteRequirement(requirementId)
  }

  // --------------------------------------------------------
  // Решения
  // --------------------------------------------------------

  async listDecisions(principal: AuthenticatedPrincipal, projectId: string): Promise<DecisionDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listDecisions(projectId)).map(decisionDto)
  }

  async getDecision(principal: AuthenticatedPrincipal, decisionId: string): Promise<DecisionDto> {
    const row = await this.find(() => this.dependencies.repository.findDecisionById(decisionId), 'Decision')
    await this.dependencies.guard.requireView(principal.id, row.projectId)
    return decisionDto(row)
  }

  async createDecision(principal: AuthenticatedPrincipal, projectId: string, input: CreateDecisionRequest): Promise<DecisionDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    return decisionDto(
      await this.dependencies.repository.createDecision({
        projectId,
        title: input.title,
        rationale: input.rationale,
        participants: input.participants,
        status: input.status ?? 'active',
        decidedAt: input.decidedAt ?? new Date(),
      }),
    )
  }

  async updateDecision(principal: AuthenticatedPrincipal, decisionId: string, input: UpdateDecisionRequest): Promise<DecisionDto> {
    const row = await this.find(() => this.dependencies.repository.findDecisionById(decisionId), 'Decision')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    const updated = await this.dependencies.repository.updateDecision(decisionId, {
      ...input,
      decidedAt: input.decidedAt ?? undefined,
    })
    return decisionDto(updated ?? row)
  }

  async deleteDecision(principal: AuthenticatedPrincipal, decisionId: string): Promise<void> {
    const row = await this.find(() => this.dependencies.repository.findDecisionById(decisionId), 'Decision')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    await this.dependencies.repository.deleteDecision(decisionId)
  }

  // --------------------------------------------------------
  // Коммуникации
  // --------------------------------------------------------

  async listCommunications(principal: AuthenticatedPrincipal, projectId: string): Promise<CommunicationDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listCommunications(projectId)).map(communicationDto)
  }

  async getCommunication(principal: AuthenticatedPrincipal, communicationId: string): Promise<CommunicationDto> {
    const row = await this.find(() => this.dependencies.repository.findCommunicationById(communicationId), 'Communication')
    await this.dependencies.guard.requireView(principal.id, row.projectId)
    return communicationDto(row)
  }

  async createCommunication(principal: AuthenticatedPrincipal, projectId: string, input: CreateCommunicationRequest): Promise<CommunicationDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    return communicationDto(
      await this.dependencies.repository.createCommunication({
        projectId,
        title: input.title,
        kind: input.kind ?? 'meeting',
        participants: input.participants,
        summary: input.summary,
        heldAt: input.heldAt ?? new Date(),
      }),
    )
  }

  async updateCommunication(principal: AuthenticatedPrincipal, communicationId: string, input: UpdateCommunicationRequest): Promise<CommunicationDto> {
    const row = await this.find(() => this.dependencies.repository.findCommunicationById(communicationId), 'Communication')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    const updated = await this.dependencies.repository.updateCommunication(communicationId, {
      ...input,
      heldAt: input.heldAt ?? undefined,
    })
    return communicationDto(updated ?? row)
  }

  async deleteCommunication(principal: AuthenticatedPrincipal, communicationId: string): Promise<void> {
    const row = await this.find(() => this.dependencies.repository.findCommunicationById(communicationId), 'Communication')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    await this.dependencies.repository.deleteCommunication(communicationId)
  }

  // --------------------------------------------------------
  // Quick wins
  // --------------------------------------------------------

  async listQuickWins(principal: AuthenticatedPrincipal, projectId: string, query: QuickWinsQuery): Promise<QuickWinDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listQuickWins(projectId))
      .filter((row) => (query.domainId === undefined ? true : row.domainId === query.domainId))
      .filter((row) => (query.status === undefined ? true : row.status === query.status))
      .map(quickWinDto)
  }

  async getQuickWin(principal: AuthenticatedPrincipal, quickWinId: string): Promise<QuickWinDto> {
    const row = await this.find(() => this.dependencies.repository.findQuickWinById(quickWinId), 'Quick win')
    await this.dependencies.guard.requireView(principal.id, row.projectId)
    return quickWinDto(row)
  }

  async createQuickWin(principal: AuthenticatedPrincipal, projectId: string, input: CreateQuickWinRequest): Promise<QuickWinDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    await this.assertLinks(projectId, input.domainId ?? null, null)
    return quickWinDto(
      await this.dependencies.repository.createQuickWin({
        projectId,
        domainId: input.domainId ?? null,
        title: input.title,
        effect: input.effect,
        effort: input.effort,
        status: input.status ?? 'suggested',
      }),
    )
  }

  async updateQuickWin(principal: AuthenticatedPrincipal, quickWinId: string, input: UpdateQuickWinRequest): Promise<QuickWinDto> {
    const row = await this.find(() => this.dependencies.repository.findQuickWinById(quickWinId), 'Quick win')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    const domainId = input.domainId === undefined ? row.domainId : input.domainId ?? null
    await this.assertLinks(row.projectId, domainId, null)
    const updated = await this.dependencies.repository.updateQuickWin(quickWinId, { ...input, domainId })
    return quickWinDto(updated ?? row)
  }

  async deleteQuickWin(principal: AuthenticatedPrincipal, quickWinId: string): Promise<void> {
    const row = await this.find(() => this.dependencies.repository.findQuickWinById(quickWinId), 'Quick win')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    await this.dependencies.repository.deleteQuickWin(quickWinId)
  }

  // --------------------------------------------------------
  // Базлайн
  // --------------------------------------------------------

  async listBaselines(principal: AuthenticatedPrincipal, projectId: string, query: BaselinesQuery): Promise<BaselineDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listBaselines(projectId))
      .filter((row) => (query.domainId === undefined ? true : row.domainId === query.domainId))
      .map(baselineDto)
  }

  async getBaseline(principal: AuthenticatedPrincipal, baselineId: string): Promise<BaselineDto> {
    const row = await this.find(() => this.dependencies.repository.findBaselineById(baselineId), 'Baseline')
    await this.dependencies.guard.requireView(principal.id, row.projectId)
    return baselineDto(row)
  }

  async createBaseline(principal: AuthenticatedPrincipal, projectId: string, input: CreateBaselineRequest): Promise<BaselineDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    await this.assertLinks(projectId, input.domainId ?? null, null)
    return baselineDto(
      await this.dependencies.repository.createBaseline({
        projectId,
        domainId: input.domainId ?? null,
        metric: input.metric,
        value: input.value,
        unit: input.unit,
        comment: input.comment,
        source: input.source,
      }),
    )
  }

  async updateBaseline(principal: AuthenticatedPrincipal, baselineId: string, input: UpdateBaselineRequest): Promise<BaselineDto> {
    const row = await this.find(() => this.dependencies.repository.findBaselineById(baselineId), 'Baseline')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    const domainId = input.domainId === undefined ? row.domainId : input.domainId ?? null
    await this.assertLinks(row.projectId, domainId, null)
    const updated = await this.dependencies.repository.updateBaseline(baselineId, { ...input, domainId })
    return baselineDto(updated ?? row)
  }

  async deleteBaseline(principal: AuthenticatedPrincipal, baselineId: string): Promise<void> {
    const row = await this.find(() => this.dependencies.repository.findBaselineById(baselineId), 'Baseline')
    await this.dependencies.guard.requireEdit(principal.id, row.projectId)
    await this.dependencies.repository.deleteBaseline(baselineId)
  }

  // --------------------------------------------------------
  // Общее
  // --------------------------------------------------------

  private async assertLinks(projectId: string, domainId: string | null, findingId: string | null) {
    if (domainId != null) {
      const domain = await this.dependencies.repository.findDomainById(domainId)
      if (!domain || domain.projectId !== projectId) {
        throw new RegistriesFailure('invalid', 'Domain does not belong to this project')
      }
    }
    if (findingId != null) {
      const finding = await this.dependencies.repository.findFindingByIdForProject(projectId, findingId)
      if (!finding) throw new RegistriesFailure('invalid', 'Finding does not belong to this project')
    }
  }

  private async assertOwner(projectId: string, ownerId: string | null) {
    if (ownerId != null) {
      const memberRole = await this.dependencies.repository.findMemberRole(projectId, ownerId)
      if (memberRole === null) {
        throw new RegistriesFailure('invalid', 'Owner must be a member of this project')
      }
    }
  }

  private async find<T extends { projectId: string }>(load: () => Promise<T | null>, what: string): Promise<T> {
    const row = await load()
    if (!row) throw new RegistriesFailure('not_found', `${what} not found`)
    return row
  }
}

export function gapDto(row: GapRow): GapDto {
  return {
    id: row.id,
    projectId: row.projectId,
    domainId: row.domainId,
    findingId: row.findingId,
    requirement: row.requirement,
    kind: row.kind,
    status: row.status,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  }
}

/// Критичность = вероятность × влияние; хранятся только множители.
export function riskDto(row: RiskRow): RiskDto {
  return {
    id: row.id,
    projectId: row.projectId,
    domainId: row.domainId,
    ownerId: row.ownerId,
    title: row.title,
    probability: row.probability,
    impact: row.impact,
    criticality: row.probability * row.impact,
    status: row.status,
    mitigation: row.mitigation,
    createdAt: row.createdAt.toISOString(),
  }
}

export function requirementDto(row: RequirementRow): RequirementDto {
  return {
    id: row.id,
    projectId: row.projectId,
    domainId: row.domainId,
    findingId: row.findingId,
    title: row.title,
    source: row.source,
    moscow: row.moscow,
    createdAt: row.createdAt.toISOString(),
  }
}

export function decisionDto(row: DecisionRow): DecisionDto {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    rationale: row.rationale,
    participants: row.participants,
    status: row.status,
    decidedAt: row.decidedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

export function communicationDto(row: CommunicationRow): CommunicationDto {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    kind: row.kind,
    participants: row.participants,
    summary: row.summary,
    heldAt: row.heldAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

export function quickWinDto(row: QuickWinRow): QuickWinDto {
  return {
    id: row.id,
    projectId: row.projectId,
    domainId: row.domainId,
    title: row.title,
    effect: row.effect,
    effort: row.effort,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }
}

export function baselineDto(row: BaselineRow): BaselineDto {
  return {
    id: row.id,
    projectId: row.projectId,
    domainId: row.domainId,
    metric: row.metric,
    value: row.value,
    unit: row.unit,
    comment: row.comment,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  }
}
