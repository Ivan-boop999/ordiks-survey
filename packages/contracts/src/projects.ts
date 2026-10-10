import { z } from 'zod'

import { emailSchema } from './auth'
import {
  domainStatusSchema,
  memberRoleSchema,
  projectAccessSchema,
  projectStatusSchema,
  stageStatusSchema,
  taskStatusSchema,
  type MemberRole,
} from './survey'

const isoDateTime = z.string().datetime()
const idSchema = z.string().min(1)
const uuidSchema = z.uuid()
const nullableDateTime = z.union([isoDateTime, z.null()])

// ============================================================
// Справочники проекта (settings JSON): статусы находок, приоритеты,
// поля и значения паспорта, типы фактов. Формат — как в прототипе.
// ============================================================

/** Палитра цветов чипов приложения (прототип: FSTAT_PALETTE). */
export const chipColorSchema = z.enum(['gray', 'blue', 'purple', 'amber', 'red', 'green'])
export type ChipColor = z.infer<typeof chipColorSchema>

export const findingStatusItemSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(80),
    color: chipColorSchema.default('gray'),
  })
  .strict()
export type FindingStatusItem = z.infer<typeof findingStatusItemSchema>

export const factTypeKindSchema = z.enum(['photo', 'file', 'note'])
export type FactTypeKind = z.infer<typeof factTypeKindSchema>

export const factTypeSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(80),
    kind: factTypeKindSchema,
    icon: z.string().trim().min(1).max(40),
    color: chipColorSchema.default('gray'),
  })
  .strict()
export type FactType = z.infer<typeof factTypeSchema>

export const passportFieldTypeSchema = z.enum(['text', 'number', 'date', 'select'])

export const passportFieldSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    type: passportFieldTypeSchema,
    opts: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  })
  .strict()
export type PassportField = z.infer<typeof passportFieldSchema>

export const DEFAULT_FINDING_CATEGORIES = ['Процесс', 'Данные', 'Оборудование', 'Организация']
export const DEFAULT_FINDING_PRIORITIES = ['Критично', 'Высокий', 'Средний', 'Низкий']

const DEFAULT_FINDING_STATUSES: readonly FindingStatusItem[] = [
  { id: 'registered', name: 'Зарегистрирована', color: 'gray' },
  { id: 'confirmed', name: 'Подтверждена', color: 'blue' },
  { id: 'discussed', name: 'В обсуждении', color: 'purple' },
  { id: 'closed', name: 'Закрыта', color: 'green' },
]

const DEFAULT_FACT_TYPES: readonly FactType[] = [
  { key: 'photo', name: 'Фото', kind: 'photo', icon: 'image', color: 'purple' },
  { key: 'file', name: 'Файл', kind: 'file', icon: 'file', color: 'blue' },
  { key: 'note', name: 'Заметка', kind: 'note', icon: 'note', color: 'gray' },
]

const dictionaryItem = z.string().trim().min(1).max(80)

/**
 * Справочники проекта целиком (колонка `projects.settings`). Массивы категорий/приоритетов и
 * статусы находок имеют прототипные дефолты, поэтому чтение пустого JSON даёт рабочий справочник,
 * а запись нормализует то, что прислал клиент. Полная замена: PATCH присылает объект целиком.
 */
export const projectSettingsSchema = z
  .object({
    findingCategories: z.array(dictionaryItem).max(50).default([...DEFAULT_FINDING_CATEGORIES]),
    findingPriorities: z.array(dictionaryItem).max(50).default([...DEFAULT_FINDING_PRIORITIES]),
    findingStatuses: z
      .array(findingStatusItemSchema)
      .max(50)
      .default(DEFAULT_FINDING_STATUSES.map((status) => ({ ...status }))),
    factTypes: z
      .array(factTypeSchema)
      .max(50)
      .default(DEFAULT_FACT_TYPES.map((type) => ({ ...type }))),
    passportFields: z.array(passportFieldSchema).max(100).default([]),
    passportValues: z.record(z.string().min(1).max(64), z.string().max(2000)).default({}),
  })
  .strict()
export type ProjectSettings = z.infer<typeof projectSettingsSchema>
export type ProjectSettingsInput = z.input<typeof projectSettingsSchema>

// ============================================================
// Проекты
// ============================================================

export const projectSummarySchema = z
  .object({
    id: idSchema,
    name: z.string(),
    client: z.string(),
    city: z.string(),
    status: projectStatusSchema,
    access: projectAccessSchema,
    /// Непрочитанные комментарии проекта: новее ThreadRead пользователя, не от него самого.
    unreadComments: z.number().int().nonnegative(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
export type ProjectSummary = z.infer<typeof projectSummarySchema>

export const projectDetailSchema = projectSummarySchema.extend({
  boundaries: z.string(),
  goals: z.string(),
  shops: z.array(z.string()),
  settings: projectSettingsSchema,
  members: z.array(
    z
      .object({
        id: idSchema,
        userId: idSchema,
        role: memberRoleSchema,
        email: emailSchema,
        displayName: z.string().nullable(),
        createdAt: isoDateTime,
      })
      .strict(),
  ),
})
export type ProjectDetail = z.infer<typeof projectDetailSchema>

export const projectMemberSchema = projectDetailSchema.shape.members.element
export type ProjectMemberDto = z.infer<typeof projectMemberSchema>

export const projectMembersResponseSchema = z
  .object({
    items: z.array(projectMemberSchema),
  })
  .strict()
export type ProjectMembersResponse = z.infer<typeof projectMembersResponseSchema>

export const projectsResponseSchema = z
  .object({
    items: z.array(projectSummarySchema),
  })
  .strict()
export type ProjectsResponse = z.infer<typeof projectsResponseSchema>

export const projectParamsSchema = z
  .object({
    projectId: uuidSchema,
  })
  .strict()

/**
 * Шаблон-объект при создании проекта: снимок библиотеки методик (как `defaultTemplates()` и
 * `createProjectFromTemplate()` прототипа) без записей и прогресса. Этапы раскладываются по датам
 * от сегодня, последний получает milestone; домены попадают в группы по индексу.
 */
export const projectTemplateSchema = z
  .object({
    stageNames: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
    weeks: z.number().int().positive().max(156).optional(),
    groups: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
    domains: z
      .array(
        z
          .object({
            groupIndex: z.number().int().nonnegative(),
            name: z.string().trim().min(1).max(200),
            checklist: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
          })
          .strict(),
      )
      .max(500)
      .default([]),
  })
  .strict()
export type ProjectTemplateInput = z.infer<typeof projectTemplateSchema>

export const createProjectRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    client: z.string().trim().max(160).default(''),
    city: z.string().trim().max(120).default(''),
    shops: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
    boundaries: z.string().max(4000).default(''),
    goals: z.string().max(8000).default(''),
    settings: projectSettingsSchema.optional(),
    template: projectTemplateSchema.optional(),
  })
  .strict()
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>

export const updateProjectRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    client: z.string().trim().max(160).optional(),
    city: z.string().trim().max(120).optional(),
    shops: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    boundaries: z.string().max(4000).optional(),
    goals: z.string().max(8000).optional(),
    settings: projectSettingsSchema.optional(),
  })
  .strict()
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>

export const updateProjectStatusRequestSchema = z
  .object({
    status: projectStatusSchema,
  })
  .strict()

export const createProjectMemberRequestSchema = z
  .object({
    userId: uuidSchema,
    role: memberRoleSchema,
  })
  .strict()
export type CreateProjectMemberRequest = z.infer<typeof createProjectMemberRequestSchema>

export const updateProjectMemberRequestSchema = z
  .object({
    role: memberRoleSchema,
  })
  .strict()

export const projectMemberParamsSchema = z
  .object({
    projectId: uuidSchema,
    memberId: uuidSchema,
  })
  .strict()

// ============================================================
// Этапы
// ============================================================

export const stageSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    name: z.string(),
    sortOrder: z.number().int(),
    startAt: nullableDateTime,
    endAt: nullableDateTime,
    milestone: z.boolean(),
    status: stageStatusSchema,
  })
  .strict()
export type StageDto = z.infer<typeof stageSchema>

export const stagesResponseSchema = z
  .object({
    items: z.array(stageSchema),
  })
  .strict()

const stageDatesSchema = {
  startAt: z.coerce.date().nullish(),
  endAt: z.coerce.date().nullish(),
}

export const createStageRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    sortOrder: z.number().int().nonnegative().optional(),
    ...stageDatesSchema,
    milestone: z.boolean().optional(),
    status: stageStatusSchema.optional(),
  })
  .strict()
export type CreateStageRequest = z.infer<typeof createStageRequestSchema>

export const updateStageRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    ...stageDatesSchema,
    milestone: z.boolean().optional(),
    status: stageStatusSchema.optional(),
  })
  .strict()
export type UpdateStageRequest = z.infer<typeof updateStageRequestSchema>

export const stageParamsSchema = z
  .object({
    stageId: uuidSchema,
  })
  .strict()

// ============================================================
// Задачи
// ============================================================

export const taskSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    stageId: z.string().nullable(),
    domainId: z.string().nullable(),
    assigneeId: z.string().nullable(),
    title: z.string(),
    description: z.string(),
    deadline: nullableDateTime,
    status: taskStatusSchema,
    sortOrder: z.number().int(),
    doneAt: nullableDateTime,
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()
export type TaskDto = z.infer<typeof taskSchema>

export const tasksResponseSchema = z
  .object({
    items: z.array(taskSchema),
  })
  .strict()

export const tasksQuerySchema = z
  .object({
    stageId: uuidSchema.optional(),
    domainId: uuidSchema.optional(),
    assigneeId: uuidSchema.optional(),
    status: taskStatusSchema.optional(),
  })
  .strict()
export type TasksQuery = z.infer<typeof tasksQuerySchema>

const taskLinksSchema = {
  stageId: uuidSchema.nullish(),
  domainId: uuidSchema.nullish(),
  assigneeId: uuidSchema.nullish(),
  deadline: z.coerce.date().nullish(),
}

export const createTaskRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(4000).default(''),
    sortOrder: z.number().int().nonnegative().optional(),
    status: taskStatusSchema.optional(),
    ...taskLinksSchema,
  })
  .strict()
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>

export const updateTaskRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(4000).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    status: taskStatusSchema.optional(),
    ...taskLinksSchema,
  })
  .strict()
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>

export const taskParamsSchema = z
  .object({
    taskId: uuidSchema,
  })
  .strict()

// ============================================================
// Домены и чек-листы
// ============================================================

export const checklistItemSchema = z
  .object({
    id: idSchema,
    domainId: idSchema,
    text: z.string(),
    done: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict()
export type ChecklistItemDto = z.infer<typeof checklistItemSchema>

export const domainSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    groupId: idSchema,
    ownerId: z.string().nullable(),
    name: z.string(),
    status: domainStatusSchema,
    sortOrder: z.number().int(),
    checklist: z.array(checklistItemSchema),
  })
  .strict()
export type DomainDto = z.infer<typeof domainSchema>

export const domainGroupSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    name: z.string(),
    sortOrder: z.number().int(),
    domains: z.array(domainSchema),
  })
  .strict()
export type DomainGroupDto = z.infer<typeof domainGroupSchema>

export const domainGroupsResponseSchema = z
  .object({
    items: z.array(domainGroupSchema),
  })
  .strict()

export const createDomainGroupRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type CreateDomainGroupRequest = z.infer<typeof createDomainGroupRequestSchema>

export const updateDomainGroupRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type UpdateDomainGroupRequest = z.infer<typeof updateDomainGroupRequestSchema>

export const domainGroupParamsSchema = z
  .object({
    groupId: uuidSchema,
  })
  .strict()

export const createDomainRequestSchema = z
  .object({
    groupId: uuidSchema,
    name: z.string().trim().min(1).max(200),
    ownerId: uuidSchema.nullish(),
    sortOrder: z.number().int().nonnegative().optional(),
    checklist: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  })
  .strict()
export type CreateDomainRequest = z.infer<typeof createDomainRequestSchema>

export const updateDomainRequestSchema = z
  .object({
    groupId: uuidSchema.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    ownerId: uuidSchema.nullish(),
    status: domainStatusSchema.optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type UpdateDomainRequest = z.infer<typeof updateDomainRequestSchema>

export const domainParamsSchema = z
  .object({
    domainId: uuidSchema,
  })
  .strict()

export const createChecklistItemRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    done: z.boolean().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type CreateChecklistItemRequest = z.infer<typeof createChecklistItemRequestSchema>

export const updateChecklistItemRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(500).optional(),
    done: z.boolean().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict()
export type UpdateChecklistItemRequest = z.infer<typeof updateChecklistItemRequestSchema>

export const checklistItemParamsSchema = z
  .object({
    itemId: uuidSchema,
  })
  .strict()

/** Отображение глобальной роли команды в роль участника проекта (для автодобавления). */
export function memberRoleForOrgRole(orgRole: 'owner' | 'manager' | 'analyst'): MemberRole {
  if (orgRole === 'analyst') return 'analyst'
  return 'manager'
}
