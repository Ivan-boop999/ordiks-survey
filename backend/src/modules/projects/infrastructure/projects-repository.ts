import type { MemberRole, OrgRole, TasksQuery } from '@ordiks-survey/contracts'

import type { DbClient } from '../../../db'
import { Prisma } from '../../../generated/prisma/client'
import { nextDomainStatus } from '../domain/checklist'
import { ProjectsFailure } from '../domain/errors'
import type {
  ChecklistItemRow,
  CreateProjectWrite,
  DomainGroupRow,
  DomainGroupTreeRow,
  DomainRow,
  ProjectDetailRow,
  ProjectMemberRow,
  ProjectRow,
  ProjectsRepository,
  StageRow,
  TaskRow,
} from '../application/ports'

const memberWithUserSelect = {
  id: true,
  projectId: true,
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { email: true, displayName: true } },
} as const

const domainOrder = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }]

export function createPrismaProjectsRepository(db: DbClient): ProjectsRepository {
  return {
    async findAccessContext(userId, projectId) {
      const [user, membership, project] = await Promise.all([
        db.user.findUnique({ where: { id: userId }, select: { orgRole: true } }),
        db.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId } },
          select: { role: true },
        }),
        db.project.findUnique({ where: { id: projectId }, select: { id: true } }),
      ])
      if (!project) return null
      return {
        orgRole: (user?.orgRole ?? 'client') as OrgRole,
        memberRole: (membership?.role ?? null) as MemberRole | null,
      }
    },

    async listProjects(userId, orgRole) {
      const team = orgRole === 'owner' || orgRole === 'manager' || orgRole === 'analyst'
      const rows = await db.project.findMany({
        // Команда видит все проекты (активные и архивные); клиент — только свои по членству.
        where: team ? {} : { members: { some: { userId } } },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        include: { members: { where: { userId }, select: { role: true } } },
      })
      return rows.map((row) => ({
        ...toProjectRow(row),
        memberRole: (row.members[0]?.role ?? null) as MemberRole | null,
      }))
    },

    async countUnreadComments(userId, projectIds) {
      const result = new Map<string, number>()
      if (projectIds.length === 0) return result
      // Комментарии доступных проектов, новее последнего чтения треда (нет чтения — не прочитан)
      // и не от самого пользователя; тот же критерий, что unreadCount() прототипа.
      const rows = await db.$queryRaw<Array<{ projectId: string; unread: bigint }>>`
        SELECT c.project_id AS "projectId", COUNT(*)::bigint AS unread
        FROM comments c
        LEFT JOIN thread_reads tr
          ON tr.user_id = ${userId} AND tr.thread_type = c.thread_type AND tr.thread_id = c.thread_id
        WHERE c.project_id IN (${Prisma.join(projectIds)})
          AND c.author_id <> ${userId}
          AND (tr.last_read_at IS NULL OR c.created_at > tr.last_read_at)
        GROUP BY c.project_id`
      for (const row of rows) result.set(row.projectId, Number(row.unread))
      return result
    },

    async createProject(input: CreateProjectWrite) {
      try {
        // Группы с доменами создаются вторым шагом: вложенное создание домена в группе
        // требует projectId (unchecked-вариант), который появляется только после проекта.
        const row = await db.$transaction(async (tx) => {
          const project = await tx.project.create({
            data: {
              name: input.project.name,
              client: input.project.client,
              city: input.project.city,
              boundaries: input.project.boundaries,
              goals: input.project.goals,
              shops: input.project.shops,
              settings: input.project.settings,
              members: {
                create: { userId: input.creatorMember.userId, role: input.creatorMember.role },
              },
              stages: { create: input.stages },
            },
          })
          for (const [groupIndex, group] of input.groups.entries()) {
            await tx.domainGroup.create({
              data: {
                projectId: project.id,
                name: group.name,
                sortOrder: group.sortOrder,
                domains: {
                  create: input.domains
                    .filter((domain) => domain.groupIndex === groupIndex)
                    .map((domain) => ({
                      projectId: project.id,
                      name: domain.name,
                      sortOrder: domain.sortOrder,
                      items: {
                        create: domain.checklist.map((text, index) => ({
                          text,
                          sortOrder: index,
                        })),
                      },
                    })),
                },
              },
            })
          }
          return project
        })
        return toProjectRow(row)
      } catch (error) {
        if (isUniqueConstraintFailure(error)) {
          throw new ProjectsFailure('conflict', 'A project with this name already exists')
        }
        throw error
      }
    },

    async findProjectById(projectId) {
      const row = await db.project.findUnique({
        where: { id: projectId },
        include: { members: { include: { user: { select: { email: true, displayName: true } } }, orderBy: { createdAt: 'asc' } } },
      })
      if (!row) return null
      return toProjectDetailRow(row)
    },

    updateProject(projectId, data) {
      const { settings, ...rest } = data
      return db.project
        .update({
          where: { id: projectId },
          data: {
            ...rest,
            ...(settings === undefined ? {} : { settings: settings as Prisma.InputJsonValue }),
          },
        })
        .then(toProjectRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    listMembers(projectId) {
      return db.projectMember
        .findMany({ where: { projectId }, orderBy: { createdAt: 'asc' }, select: memberWithUserSelect })
        .then((rows) => rows.map(toMemberRow))
    },

    async addMember(input) {
      try {
        const row = await db.projectMember.create({
          data: { projectId: input.projectId, userId: input.userId, role: input.role },
          select: memberWithUserSelect,
        })
        return toMemberRow(row)
      } catch (error) {
        if (isUniqueConstraintFailure(error)) {
          throw new ProjectsFailure('conflict', 'User is already a member of this project')
        }
        if (isForeignKeyFailure(error)) {
          throw new ProjectsFailure('not_found', 'User not found')
        }
        throw error
      }
    },

    findMemberById(memberId) {
      return db.projectMember
        .findUnique({ where: { id: memberId }, select: memberWithUserSelect })
        .then((row) => (row ? toMemberRow(row) : null))
    },

    updateMemberRole(memberId, role) {
      return db.projectMember
        .update({ where: { id: memberId }, data: { role }, select: memberWithUserSelect })
        .then((row) => toMemberRow(row))
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteMember(memberId) {
      return db.projectMember
        .delete({ where: { id: memberId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    findUserById(userId) {
      return db.user.findUnique({ where: { id: userId }, select: { id: true, orgRole: true } })
    },

    listStages(projectId) {
      return db.stage.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }) as Promise<StageRow[]>
    },

    createStage(input) {
      return db.stage.create({ data: input }) as Promise<StageRow>
    },

    findStageById(stageId) {
      return db.stage.findUnique({ where: { id: stageId } }) as Promise<StageRow | null>
    },

    updateStage(stageId, data) {
      return db.stage
        .update({ where: { id: stageId }, data })
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        }) as Promise<StageRow | null>
    },

    deleteStage(stageId) {
      return db.stage
        .delete({ where: { id: stageId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    listTasks(projectId, query: TasksQuery) {
      return db.task.findMany({
        where: {
          projectId,
          ...(query.stageId === undefined ? {} : { stageId: query.stageId }),
          ...(query.domainId === undefined ? {} : { domainId: query.domainId }),
          ...(query.assigneeId === undefined ? {} : { assigneeId: query.assigneeId }),
          ...(query.status === undefined ? {} : { status: query.status }),
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }) as Promise<TaskRow[]>
    },

    createTask(input) {
      return db.task.create({ data: input }) as Promise<TaskRow>
    },

    findTaskById(taskId) {
      return db.task.findUnique({ where: { id: taskId } }) as Promise<TaskRow | null>
    },

    updateTask(taskId, data) {
      return db.task
        .update({ where: { id: taskId }, data })
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        }) as Promise<TaskRow | null>
    },

    deleteTask(taskId) {
      return db.task
        .delete({ where: { id: taskId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    async listDomainTree(projectId) {
      const groups = await db.domainGroup.findMany({
        where: { projectId },
        orderBy: domainOrder,
        include: {
          domains: {
            orderBy: domainOrder,
            include: { items: { orderBy: domainOrder } },
          },
        },
      })
      return groups.map((group) => ({
        id: group.id,
        projectId: group.projectId,
        name: group.name,
        sortOrder: group.sortOrder,
        domains: group.domains.map((domain) => ({
          id: domain.id,
          projectId: domain.projectId,
          groupId: domain.groupId,
          ownerId: domain.ownerId,
          name: domain.name,
          status: domain.status,
          sortOrder: domain.sortOrder,
          checklist: domain.items.map(toChecklistItemRow),
        })),
      }))
    },

    async createDomainGroup(input) {
      const row = await db.domainGroup.create({ data: input })
      return toGroupRow(row)
    },

    findDomainGroupById(groupId) {
      return db.domainGroup
        .findUnique({ where: { id: groupId } })
        .then((row) => (row ? toGroupRow(row) : null))
    },

    updateDomainGroup(groupId, data) {
      return db.domainGroup
        .update({ where: { id: groupId }, data })
        .then(toGroupRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteDomainGroup(groupId) {
      return db.domainGroup
        .delete({ where: { id: groupId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    async createDomain(input) {
      const domain = await db.domain.create({
        data: {
          projectId: input.projectId,
          groupId: input.groupId,
          ownerId: input.ownerId,
          name: input.name,
          sortOrder: input.sortOrder,
          status: input.status,
          items: {
            create: input.checklist.map((text, index) => ({ text, sortOrder: index })),
          },
        },
      })
      const items = await db.checklistItem.findMany({
        where: { domainId: domain.id },
        orderBy: domainOrder,
      })
      return { ...domain, checklist: items.map(toChecklistItemRow) }
    },

    findDomainById(domainId) {
      return db.domain.findUnique({ where: { id: domainId } }) as Promise<DomainRow | null>
    },

    async updateDomain(domainId, data) {
      try {
        const domain = await db.domain.update({ where: { id: domainId }, data })
        const items = await db.checklistItem.findMany({
          where: { domainId },
          orderBy: domainOrder,
        })
        return { ...domain, checklist: items.map(toChecklistItemRow) }
      } catch (error) {
        if (isRecordNotFound(error)) return null
        throw error
      }
    },

    deleteDomain(domainId) {
      return db.domain
        .delete({ where: { id: domainId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    async createChecklistItem(input) {
      return db.$transaction(async (tx) => {
        const item = await tx.checklistItem.create({ data: input })
        await refreshDomainStatus(tx, item.domainId)
        return toChecklistItemRow(item)
      })
    },

    findChecklistItemById(itemId) {
      return db.checklistItem.findUnique({
        where: { id: itemId },
        include: { domain: true },
      }) as Promise<(ReturnType<typeof toChecklistItemRow> & { domain: DomainRow }) | null>
    },

    async updateChecklistItem(itemId, data) {
      return db.$transaction(async (tx) => {
        try {
          const item = await tx.checklistItem.update({ where: { id: itemId }, data })
          await refreshDomainStatus(tx, item.domainId)
          return toChecklistItemRow(item)
        } catch (error) {
          if (isRecordNotFound(error)) return null
          throw error
        }
      })
    },

    async deleteChecklistItem(itemId) {
      return db.$transaction(async (tx) => {
        const item = await tx.checklistItem.findUnique({
          where: { id: itemId },
          select: { domainId: true },
        })
        if (!item) return false
        await tx.checklistItem.delete({ where: { id: itemId } })
        await refreshDomainStatus(tx, item.domainId)
        return true
      })
    },
  }
}

type PrismaProjectRow = {
  id: string
  name: string
  client: string
  city: string
  status: ProjectRow['status']
  boundaries: string
  goals: string
  shops: unknown
  settings: unknown
  createdAt: Date
  updatedAt: Date
}

function toProjectRow(row: PrismaProjectRow): ProjectRow {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    city: row.city,
    status: row.status,
    boundaries: row.boundaries,
    goals: row.goals,
    shops: (row.shops as string[]) ?? [],
    settings: row.settings,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toProjectDetailRow(
  row: PrismaProjectRow & {
    members: Array<{
      id: string
      userId: string
      role: MemberRole
      createdAt: Date
      user: { email: string; displayName: string | null }
    }>
  },
): ProjectDetailRow {
  return {
    ...toProjectRow(row),
    members: row.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      role: member.role,
      email: member.user.email,
      displayName: member.user.displayName,
      createdAt: member.createdAt,
    })),
  }
}

function toMemberRow(row: {
  id: string
  projectId: string
  userId: string
  role: MemberRole
  createdAt: Date
  user: { email: string; displayName: string | null }
}): ProjectMemberRow & { projectId: string } {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    role: row.role,
    email: row.user.email,
    displayName: row.user.displayName,
    createdAt: row.createdAt,
  }
}

function toGroupRow(row: { id: string; projectId: string; name: string; sortOrder: number }): DomainGroupRow {
  return { id: row.id, projectId: row.projectId, name: row.name, sortOrder: row.sortOrder }
}

function toChecklistItemRow(row: {
  id: string
  domainId: string
  text: string
  done: boolean
  sortOrder: number
}): ChecklistItemRow {
  return { id: row.id, domainId: row.domainId, text: row.text, done: row.done, sortOrder: row.sortOrder }
}

/** Пересчитывает статус домена по чек-листу в той же транзакции, что и правка пункта. */
async function refreshDomainStatus(
  tx: Pick<DbClient, 'checklistItem' | 'domain'>,
  domainId: string,
) {
  const [domain, items] = await Promise.all([
    tx.domain.findUnique({ where: { id: domainId }, select: { status: true } }),
    tx.checklistItem.findMany({ where: { domainId }, select: { done: true } }),
  ])
  if (!domain) return
  const status = nextDomainStatus(domain.status, items)
  if (status !== domain.status) {
    await tx.domain.update({ where: { id: domainId }, data: { status } })
  }
}

function isUniqueConstraintFailure(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function isForeignKeyFailure(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003'
}

function isRecordNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}
