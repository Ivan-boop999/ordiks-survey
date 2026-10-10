import type { ApprovalDecision, ProjectSettings } from '@ordiks-survey/contracts'

export type Clock = {
  now(): Date
}

export type SectionApprovalRow = {
  userId: string
  email: string
  displayName: string | null
  memberRole: string | null
  decision: ApprovalDecision
  comment: string
  createdAt: Date
  updatedAt: Date
}

export type ReportSectionRow = {
  id: string
  projectId: string
  title: string
  body: string
  sortOrder: number
  approvals: SectionApprovalRow[]
}

export type ReportRepository = {
  listSections(projectId: string): Promise<ReportSectionRow[]>

  findSectionById(sectionId: string): Promise<ReportSectionRow | null>

  createSection(projectId: string, input: { title: string; body: string; sortOrder: number }): Promise<{ id: string }>

  updateSection(
    sectionId: string,
    data: Partial<Pick<ReportSectionRow, 'title' | 'body' | 'sortOrder'>>,
  ): Promise<boolean>

  deleteSection(sectionId: string): Promise<boolean>

  /** Виза: upsert по (sectionId, userId) — повторная перезаписывается. */
  upsertApproval(
    sectionId: string,
    userId: string,
    decision: ApprovalDecision,
    comment: string,
  ): Promise<SectionApprovalRow>

  /// Правка содержимого обнуляет визы (invalidateApprovals прототипа).
  deleteApprovals(sectionId: string): Promise<number>

  /// Данные для автовставок.
  findProjectSettings(projectId: string): Promise<ProjectSettings | null>

  findDomainById(domainId: string): Promise<{ id: string; projectId: string; name: string } | null>

  listFindingsOfDomain(projectId: string, domainId: string): Promise<Array<{ title: string; priority: string; status: string }>>

  listOpenRequests(projectId: string): Promise<
    Array<{ what: string; assigneeName: string | null; deadline: Date | null; overdue: boolean; status: string }>
  >

  listCoverage(projectId: string): Promise<
    Array<{ groupName: string; items: number; done: number; domainsTotal: number; domainsClosed: number }>
  >

  listRisks(projectId: string): Promise<
    Array<{
      title: string
      probability: number
      impact: number
      status: string
      ownerName: string | null
      mitigation: string
    }>
  >

  findRegistryTree(
    registryId: string,
  ): Promise<{
    id: string
    projectId: string
    name: string
    fields: Array<{ key: string; name: string; type: string; options: string[]; formula: unknown }>
    statuses: Array<{ id: string; name: string }>
    entries: Array<{ statusId: string | null; values: Record<string, unknown> }>
  } | null>

  /// Клиентские участники, чьи визы ждём (client_lead/client_staff).
  listClientApprovers(projectId: string): Promise<Array<{ userId: string; displayName: string | null }>>
}
