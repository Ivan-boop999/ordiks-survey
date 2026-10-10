import type {
  CommunicationKind,
  DecisionStatus,
  GapKind,
  GapStatus,
  MoscowPriority,
  QuickWinStatus,
  RiskStatus,
} from '@ordiks-survey/contracts'

export type Clock = {
  now(): Date
}

// ============================================================
// Свои реестры
// ============================================================

export type CustomFieldRow = {
  id: string
  registryId: string
  key: string
  name: string
  type: string
  options: string[]
  formula: unknown
  sortOrder: number
}

export type RegistryStatusRow = {
  id: string
  registryId: string
  name: string
  color: string
  sortOrder: number
}

export type RegistryEntryRow = {
  id: string
  registryId: string
  statusId: string | null
  values: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type CustomRegistryRow = {
  id: string
  projectId: string
  name: string
  description: string
  fields: CustomFieldRow[]
  statuses: RegistryStatusRow[]
}

export type RegistriesRepository = {
  listRegistries(projectId: string): Promise<CustomRegistryRow[]>

  findRegistryTree(registryId: string): Promise<(CustomRegistryRow & { entries?: undefined }) | null>

  findRegistryById(registryId: string): Promise<{ id: string; projectId: string; name: string } | null>

  createRegistry(projectId: string, input: { name: string; description: string }): Promise<{ id: string }>

  updateRegistry(registryId: string, data: { name?: string; description?: string }): Promise<boolean>

  deleteRegistry(registryId: string): Promise<boolean>

  findFieldById(fieldId: string): Promise<CustomFieldRow | null>

  createField(registryId: string, input: Omit<CustomFieldRow, 'id' | 'registryId'>): Promise<CustomFieldRow>

  updateField(fieldId: string, data: Partial<Omit<CustomFieldRow, 'id' | 'registryId'>>): Promise<CustomFieldRow | null>

  deleteField(fieldId: string): Promise<boolean>

  /** Удаление поля вычищает ключ из values всех записей реестра (одна транзакция). */
  deleteFieldWithValues(fieldId: string): Promise<boolean>

  findStatusById(statusId: string): Promise<RegistryStatusRow | null>

  createStatus(registryId: string, input: { name: string; color: string; sortOrder: number }): Promise<RegistryStatusRow>

  updateStatus(statusId: string, data: Partial<Pick<RegistryStatusRow, 'name' | 'color' | 'sortOrder'>>): Promise<RegistryStatusRow | null>

  /** Удаление статуса: записи на нём переезжают на первый оставшийся (sortOrder), ответ — куда и сколько. */
  deleteStatusWithMove(statusId: string): Promise<{ movedTo: string | null; movedCount: number } | null>

  listEntries(registryId: string): Promise<RegistryEntryRow[]>

  findEntryById(entryId: string): Promise<RegistryEntryRow | null>

  createEntry(registryId: string, input: { values: Record<string, unknown>; statusId: string | null }): Promise<RegistryEntryRow>

  updateEntry(entryId: string, data: { values?: Record<string, unknown>; statusId: string | null }): Promise<RegistryEntryRow | null>

  deleteEntry(entryId: string): Promise<boolean>

  bulkUpdateEntryStatus(registryId: string, ids: string[], statusId: string): Promise<number>

  bulkDeleteEntries(registryId: string, ids: string[]): Promise<number>

  /** Импорт: один пакет записей в одной транзакции. */
  createEntries(
    registryId: string,
    entries: Array<{ values: Record<string, unknown>; statusId: string | null }>,
  ): Promise<number>
}

// ============================================================
// Аналитические реестры
// ============================================================

export type GapRow = {
  id: string
  projectId: string
  domainId: string | null
  findingId: string | null
  requirement: string
  kind: GapKind
  status: GapStatus
  comment: string
  createdAt: Date
}

export type RiskRow = {
  id: string
  projectId: string
  domainId: string | null
  ownerId: string | null
  title: string
  probability: number
  impact: number
  status: RiskStatus
  mitigation: string
  createdAt: Date
}

export type RequirementRow = {
  id: string
  projectId: string
  domainId: string | null
  findingId: string | null
  title: string
  source: string
  moscow: MoscowPriority
  createdAt: Date
}

export type DecisionRow = {
  id: string
  projectId: string
  title: string
  rationale: string
  participants: string
  status: DecisionStatus
  decidedAt: Date
  createdAt: Date
}

export type CommunicationRow = {
  id: string
  projectId: string
  title: string
  kind: CommunicationKind
  participants: string
  summary: string
  heldAt: Date
  createdAt: Date
}

export type QuickWinRow = {
  id: string
  projectId: string
  domainId: string | null
  title: string
  effect: string
  effort: string
  status: QuickWinStatus
  createdAt: Date
}

export type BaselineRow = {
  id: string
  projectId: string
  domainId: string | null
  metric: string
  value: string
  unit: string
  comment: string
  source: string
  createdAt: Date
}

export type AnalyticsRepository = {
  // GAP
  listGaps(projectId: string): Promise<GapRow[]>
  createGap(input: Omit<GapRow, 'id' | 'createdAt'>): Promise<GapRow>
  findGapById(gapId: string): Promise<GapRow | null>
  updateGap(gapId: string, data: Partial<Omit<GapRow, 'id' | 'projectId' | 'createdAt'>>): Promise<GapRow | null>
  deleteGap(gapId: string): Promise<boolean>

  // Риски
  listRisks(projectId: string): Promise<RiskRow[]>
  createRisk(input: Omit<RiskRow, 'id' | 'createdAt'>): Promise<RiskRow>
  findRiskById(riskId: string): Promise<RiskRow | null>
  updateRisk(riskId: string, data: Partial<Omit<RiskRow, 'id' | 'projectId' | 'createdAt'>>): Promise<RiskRow | null>
  deleteRisk(riskId: string): Promise<boolean>

  // Требования
  listRequirements(projectId: string): Promise<RequirementRow[]>
  createRequirement(input: Omit<RequirementRow, 'id' | 'createdAt'>): Promise<RequirementRow>
  findRequirementById(requirementId: string): Promise<RequirementRow | null>
  updateRequirement(requirementId: string, data: Partial<Omit<RequirementRow, 'id' | 'projectId' | 'createdAt'>>): Promise<RequirementRow | null>
  deleteRequirement(requirementId: string): Promise<boolean>

  // Решения
  listDecisions(projectId: string): Promise<DecisionRow[]>
  createDecision(input: Omit<DecisionRow, 'id' | 'createdAt'>): Promise<DecisionRow>
  findDecisionById(decisionId: string): Promise<DecisionRow | null>
  updateDecision(decisionId: string, data: Partial<Omit<DecisionRow, 'id' | 'projectId' | 'createdAt'>>): Promise<DecisionRow | null>
  deleteDecision(decisionId: string): Promise<boolean>

  // Коммуникации
  listCommunications(projectId: string): Promise<CommunicationRow[]>
  createCommunication(input: Omit<CommunicationRow, 'id' | 'createdAt'>): Promise<CommunicationRow>
  findCommunicationById(communicationId: string): Promise<CommunicationRow | null>
  updateCommunication(communicationId: string, data: Partial<Omit<CommunicationRow, 'id' | 'projectId' | 'createdAt'>>): Promise<CommunicationRow | null>
  deleteCommunication(communicationId: string): Promise<boolean>

  // Quick wins
  listQuickWins(projectId: string): Promise<QuickWinRow[]>
  createQuickWin(input: Omit<QuickWinRow, 'id' | 'createdAt'>): Promise<QuickWinRow>
  findQuickWinById(quickWinId: string): Promise<QuickWinRow | null>
  updateQuickWin(quickWinId: string, data: Partial<Omit<QuickWinRow, 'id' | 'projectId' | 'createdAt'>>): Promise<QuickWinRow | null>
  deleteQuickWin(quickWinId: string): Promise<boolean>

  // Базлайн
  listBaselines(projectId: string): Promise<BaselineRow[]>
  createBaseline(input: Omit<BaselineRow, 'id' | 'createdAt'>): Promise<BaselineRow>
  findBaselineById(baselineId: string): Promise<BaselineRow | null>
  updateBaseline(baselineId: string, data: Partial<Omit<BaselineRow, 'id' | 'projectId' | 'createdAt'>>): Promise<BaselineRow | null>
  deleteBaseline(baselineId: string): Promise<boolean>

  // Общие проверки связей
  findDomainById(domainId: string): Promise<{ id: string; projectId: string } | null>
  findFindingByIdForProject(projectId: string, findingId: string): Promise<{ id: string } | null>
  findMemberRole(projectId: string, userId: string): Promise<string | null>
}
