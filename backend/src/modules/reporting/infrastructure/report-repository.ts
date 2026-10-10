import { projectSettingsSchema, type ApprovalDecision } from '@ordiks-survey/contracts'

import type { DbClient } from '../../../db'
import { Prisma } from '../../../generated/prisma/client'
import type {
  ReportRepository,
  ReportSectionRow,
  SectionApprovalRow,
} from '../application/ports'

const approvalInclude = {
  include: {
    user: { select: { id: true, email: true, displayName: true } },
  },
}

type ApprovalRow = {
  userId: string
  decision: string
  comment: string
  createdAt: Date
  updatedAt: Date
  user: { id: string; email: string; displayName: string | null }
}

function toApprovalRow(row: ApprovalRow, memberRoles: Map<string, string | null>): SectionApprovalRow {
  return {
    userId: row.userId,
    email: row.user.email,
    displayName: row.user.displayName,
    memberRole: memberRoles.get(row.userId) ?? null,
    decision: row.decision as ApprovalDecision,
    comment: row.comment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function createPrismaReportRepository(db: DbClient): ReportRepository {
  /// Визы без memberRole: роли добираем одним запросом по членам проекта.
  const memberRolesFor = async (projectId: string, approvals: ApprovalRow[]) => {
    const rows = await db.projectMember.findMany({
      where: { projectId, userId: { in: approvals.map((row) => row.userId) } },
      select: { userId: true, role: true },
    })
    const roles = new Map(rows.map((row) => [row.userId, row.role]))
    return approvals.map((row) => toApprovalRow(row, roles))
  }

  const sectionWithApprovals = async (row: { id: string; projectId: string; title: string; body: string; sortOrder: number }, approvals: ApprovalRow[]): Promise<ReportSectionRow> => {
    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      body: row.body,
      sortOrder: row.sortOrder,
      approvals: await memberRolesFor(row.projectId, approvals),
    }
  }

  return {
    async listSections(projectId) {
      const rows = await db.reportSection.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: {
          approvals: { orderBy: [{ updatedAt: 'desc' }, { userId: 'asc' }], include: approvalInclude.include },
        },
      })
      return Promise.all(
        rows.map((row) =>
          sectionWithApprovals(row, row.approvals as unknown as ApprovalRow[]),
        ),
      )
    },

    async findSectionById(sectionId) {
      const row = await db.reportSection.findUnique({
        where: { id: sectionId },
        include: {
          approvals: { orderBy: [{ updatedAt: 'desc' }, { userId: 'asc' }], include: approvalInclude.include },
        },
      })
      if (!row) return null
      return sectionWithApprovals(row, row.approvals as unknown as ApprovalRow[])
    },

    createSection(projectId, input) {
      return db.reportSection.create({ data: { projectId, ...input }, select: { id: true } })
    },

    updateSection(sectionId, data) {
      return db.reportSection
        .update({ where: { id: sectionId }, data })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    deleteSection(sectionId) {
      return db.reportSection
        .delete({ where: { id: sectionId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    async upsertApproval(sectionId, userId, decision, comment) {
      const row = await db.sectionApproval.upsert({
        where: { sectionId_userId: { sectionId, userId } },
        create: { sectionId, userId, decision, comment },
        update: { decision, comment },
        ...approvalInclude,
      })
      const section = await db.reportSection.findUnique({
        where: { id: sectionId },
        select: { projectId: true },
      })
      const [withRole] = await memberRolesFor(section?.projectId ?? '', [row as unknown as ApprovalRow])
      return withRole
    },

    deleteApprovals(sectionId) {
      return db.sectionApproval
        .deleteMany({ where: { sectionId } })
        .then((result) => result.count)
    },

    findProjectSettings(projectId) {
      return db.project
        .findUnique({ where: { id: projectId }, select: { settings: true } })
        .then((row) => {
          if (!row) return null
          const parsed = projectSettingsSchema.safeParse(row.settings ?? {})
          return parsed.success ? parsed.data : projectSettingsSchema.parse({})
        })
    },

    findDomainById(domainId) {
      return db.domain.findUnique({
        where: { id: domainId },
        select: { id: true, projectId: true, name: true },
      })
    },

    listFindingsOfDomain(projectId, domainId) {
      return db.finding.findMany({
        where: { projectId, domainId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { title: true, priority: true, status: true },
      })
    },

    listOpenRequests(projectId) {
      return db.dataRequest.findMany({
        where: { projectId },
        orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
        select: {
          what: true,
          deadline: true,
          status: true,
          assignee: { select: { displayName: true } },
        },
      }).then((rows) =>
        rows.map((row) => ({
          what: row.what,
          assigneeName: row.assignee?.displayName ?? null,
          deadline: row.deadline,
          status: row.status,
          // Просроченность считаем здесь: дедлайн < now и статус != received.
          overdue: row.status !== 'received' && row.deadline !== null && row.deadline.getTime() < Date.now(),
        })),
      )
    },

    async listCoverage(projectId) {
      const groups = await db.domainGroup.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          name: true,
          domains: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: { status: true, items: { select: { done: true } } },
          },
        },
      })
      return groups.map((group) => {
        const items = group.domains.flatMap((domain) => domain.items)
        return {
          groupName: group.name,
          items: items.length,
          done: items.filter((item) => item.done).length,
          domainsTotal: group.domains.length,
          domainsClosed: group.domains.filter((domain) => domain.status === 'closed').length,
        }
      })
    },

    listRisks(projectId) {
      return db.risk.findMany({
        where: { projectId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          title: true,
          probability: true,
          impact: true,
          status: true,
          mitigation: true,
          owner: { select: { displayName: true } },
        },
      }).then((rows) =>
        rows.map((row) => ({
          title: row.title,
          probability: row.probability,
          impact: row.impact,
          status: row.status,
          ownerName: row.owner?.displayName ?? null,
          mitigation: row.mitigation,
        })),
      )
    },

    findRegistryTree(registryId) {
      return db.customRegistry.findUnique({
        where: { id: registryId },
        include: {
          fields: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
          statuses: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, name: true } },
          entries: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { statusId: true, values: true } },
        },
      }).then((row) =>
        row
          ? {
              id: row.id,
              projectId: row.projectId,
              name: row.name,
              fields: row.fields.map((field) => ({
                key: field.key,
                name: field.name,
                type: field.type,
                options: Array.isArray(field.options)
                  ? field.options.filter((item): item is string => typeof item === 'string')
                  : [],
                formula: field.formula,
              })),
              statuses: row.statuses,
              entries: row.entries.map((entry) => ({
                statusId: entry.statusId,
                values: (entry.values ?? {}) as Record<string, unknown>,
              })),
            }
          : null,
      )
    },

    listClientApprovers(projectId) {
      return db.projectMember.findMany({
        where: { projectId, role: { in: ['client_lead', 'client_staff'] } },
        select: { userId: true, user: { select: { displayName: true } } },
        orderBy: [{ role: 'asc' }, { userId: 'asc' }],
      }).then((rows) =>
        rows.map((row) => ({ userId: row.userId, displayName: row.user.displayName })),
      )
    },
  }
}

function isRecordNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}
