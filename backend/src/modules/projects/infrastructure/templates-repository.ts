import {
  memberRoleForOrgRole,
  projectSettingsSchema,
  projectTemplatePayloadSchema,
  type ProjectSettings,
  type ProjectTemplatePayload,
} from '@ordiks-survey/contracts'

import type { DbClient } from '../../../db'
import { Prisma } from '../../../generated/prisma/client'
import { ProjectsFailure } from '../domain/errors'
import type { TemplateRow, TemplatesRepository } from '../application/ports'

/// Стадартная длина шаблона, если в проекте нет дат этапов.
const DEFAULT_TEMPLATE_WEEKS = 4

function toTemplateRow(row: {
  id: string
  name: string
  description: string
  payload: unknown
  createdAt: Date
  updatedAt: Date
}): TemplateRow {
  return { ...row }
}

export function createPrismaTemplatesRepository(db: DbClient): TemplatesRepository {
  return {
    listTemplates() {
      return db.projectTemplate
        .findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
        .then((rows) => rows.map(toTemplateRow))
    },

    createTemplate(input) {
      return db.projectTemplate
        .create({ data: { name: input.name, description: input.description, payload: input.payload as Prisma.InputJsonValue } })
        .then(toTemplateRow)
    },

    findTemplateById(templateId) {
      return db.projectTemplate.findUnique({ where: { id: templateId } }).then((row) => (row ? toTemplateRow(row) : null))
    },

    updateTemplate(templateId, data) {
      return db.projectTemplate
        .update({
          where: { id: templateId },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.payload !== undefined ? { payload: data.payload as Prisma.InputJsonValue } : {}),
          },
        })
        .then(toTemplateRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteTemplate(templateId) {
      return db.projectTemplate
        .delete({ where: { id: templateId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    async createProjectFromTemplate(principal, input) {
      const template = await this.findTemplateById(input.templateId)
      if (!template) throw new ProjectsFailure('not_found', 'Template not found')
      const payload = parsePayload(template.payload)

      const created = await db.$transaction(async (tx) => {
        const today = startOfDay(new Date())
        const stageCount = payload.stageNames.length
        const stageSpanDays = Math.max(7, Math.round(((payload.weeks ?? DEFAULT_TEMPLATE_WEEKS) * 7) / Math.max(1, stageCount)))

        const project = await tx.project.create({
          data: {
            name: input.name,
            client: input.client,
            city: input.city,
            shops: input.shops,
            settings: settingsFromPayload(payload) as Prisma.InputJsonValue,
            members: {
              create: {
                userId: principal.id,
                role: memberRoleForOrgRole(principal.orgRole as 'owner' | 'manager' | 'analyst'),
              },
            },
            stages: {
              create: payload.stageNames.map((name, index) => ({
                name,
                sortOrder: index,
                startAt: addDays(today, index * stageSpanDays),
                endAt: addDays(today, (index + 1) * stageSpanDays - 1),
                milestone: index === stageCount - 1,
                status: index === 0 ? ('active' as const) : ('planned' as const),
              })),
            },
            sections: {
              create: payload.reportSections.map((title, index) => ({ title, sortOrder: index })),
            },
          },
        })

        // Домены в группы по индексу; чек-листы с чистого листа (без прогресса шаблона-источника).
        for (const [groupIndex, groupName] of payload.groups.entries()) {
          await tx.domainGroup.create({
            data: {
              projectId: project.id,
              name: groupName,
              sortOrder: groupIndex,
              domains: {
                create: payload.domains
                  .filter((domain) => domain.groupIndex === groupIndex)
                  .map((domain, domainIndex) => ({
                    projectId: project.id,
                    name: domain.name,
                    sortOrder: domainIndex,
                    items: {
                      create: domain.checklist.map((text, itemIndex) => ({ text, sortOrder: itemIndex })),
                    },
                  })),
              },
            },
          })
        }

        // Гайды: первый проход — секции/вопросы с clientRefId, второй — перевязка showIf.
        for (const guide of payload.guides) {
          const createdGuide = await tx.guide.create({ data: { projectId: project.id, name: guide.name } })
          const refToQuestionId = new Map<string, string>()
          const pendingConditions: Array<{ id: string; showIfClientRefId: string; showIfValue: string | null }> = []
          for (const [sectionIndex, section] of guide.sections.entries()) {
            const createdSection = await tx.guideSection.create({
              data: { guideId: createdGuide.id, title: section.title, sortOrder: sectionIndex },
            })
            for (const [questionIndex, question] of section.questions.entries()) {
              const createdQuestion = await tx.guideQuestion.create({
                data: {
                  sectionId: createdSection.id,
                  type: question.type,
                  text: question.text,
                  options: question.options,
                  sortOrder: questionIndex,
                },
              })
              refToQuestionId.set(question.clientRefId, createdQuestion.id)
              if (question.showIfClientRefId != null) {
                pendingConditions.push({
                  id: createdQuestion.id,
                  showIfClientRefId: question.showIfClientRefId,
                  showIfValue: question.showIfValue ?? null,
                })
              }
            }
          }
          for (const pending of pendingConditions) {
            const sourceId = refToQuestionId.get(pending.showIfClientRefId)
            if (!sourceId) continue
            await tx.guideQuestion.update({
              where: { id: pending.id },
              data: { showIfQuestionId: sourceId, showIfValue: pending.showIfValue },
            })
          }
        }

        // Свои реестры: структура (поля с формулами по ключам — ключи стабильны, перевязка
        // не нужна), записи не копируются.
        for (const registry of payload.registries) {
          await tx.customRegistry.create({
            data: {
              projectId: project.id,
              name: registry.name,
              description: registry.description,
              fields: {
                create: registry.fields.map((field, fieldIndex) => ({
                  key: field.key,
                  name: field.name,
                  type: field.type,
                  options: field.options,
                  formula: (field.formula ?? undefined) as Prisma.InputJsonValue | undefined,
                  sortOrder: fieldIndex,
                })),
              },
              statuses: {
                create: registry.statuses.map((status, statusIndex) => ({
                  name: status.name,
                  color: status.color,
                  sortOrder: statusIndex,
                })),
              },
            },
          })
        }

        return project
      })

      return { id: created.id }
    },

    async buildPayloadFromProject(projectId) {
      const project = await db.project.findUnique({
        where: { id: projectId },
        include: {
          stages: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
          groups: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            include: {
              domains: {
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                include: { items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
              },
            },
          },
          guides: {
            orderBy: { createdAt: 'asc' },
            include: {
              sections: {
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                include: { questions: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
              },
            },
          },
          sections: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { title: true } },
          registries: {
            orderBy: { id: 'asc' },
            include: {
              fields: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
              statuses: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { name: true, color: true } },
            },
          },
        },
      })
      if (!project) throw new ProjectsFailure('not_found', 'Project not found')

      const settings = projectSettingsSchema.parse(project.settings ?? {})
      const groupIndexById = new Map(project.groups.map((group, index) => [group.id, index]))

      // Недель в шаблоне — по датам этапов (templateFromProject прототипа).
      const starts = project.stages.map((stage) => stage.startAt).filter((date): date is Date => date !== null)
      const ends = project.stages.map((stage) => stage.endAt ?? stage.startAt).filter((date): date is Date => date !== null)
      const weeks =
        starts.length > 0 && ends.length > 0
          ? Math.max(1, Math.round((ends[ends.length - 1].getTime() - starts[0].getTime()) / (7 * 24 * 3600 * 1000)))
          : DEFAULT_TEMPLATE_WEEKS

      const payload: ProjectTemplatePayload = {
        stageNames: project.stages.map((stage) => stage.name),
        weeks,
        groups: project.groups.map((group) => group.name),
        domains: project.groups.flatMap((group) =>
          group.domains.map((domain) => ({
            groupIndex: groupIndexById.get(group.id) ?? 0,
            name: domain.name,
            // Чек-лист без прогресса: только тексты.
            checklist: domain.items.map((item) => item.text),
          })),
        ),
        reportSections: project.sections.map((section) => section.title),
        guides: project.guides.map((guide) => ({
          name: guide.name,
          sections: guide.sections.map((section) => ({
            title: section.title,
            questions: section.questions.map((question) => {
              const options = Array.isArray(question.options)
                ? question.options.filter((item): item is string => typeof item === 'string')
                : []
              return {
                // clientRefId — id вопроса в проекте-источнике; разворачивание перевяжет.
                clientRefId: question.id,
                type: question.type as 'text' | 'yn' | 'scale' | 'choice' | 'multi',
                text: question.text,
                options,
                ...(question.showIfQuestionId != null ? { showIfClientRefId: question.showIfQuestionId } : {}),
                ...(question.showIfValue != null ? { showIfValue: question.showIfValue } : {}),
              }
            }),
          })),
        })),
        dictionaries: {
          findingCategories: settings.findingCategories,
          findingPriorities: settings.findingPriorities,
          findingStatuses: settings.findingStatuses,
          factTypes: settings.factTypes,
          passportFields: settings.passportFields,
        },
        registries: project.registries.map((registry) => ({
          name: registry.name,
          description: registry.description,
          fields: registry.fields.map((field) => ({
            key: field.key,
            name: field.name,
            type: field.type as 'text' | 'number' | 'date' | 'select' | 'formula',
            options: Array.isArray(field.options)
              ? field.options.filter((item): item is string => typeof item === 'string')
              : [],
            ...(field.formula != null ? { formula: field.formula as never } : {}),
          })),
          statuses: registry.statuses.map((status) => ({ name: status.name, color: status.color as never })),
        })),
        fromProject: project.name,
      }

      return projectTemplatePayloadSchema.parse(payload)
    },
  }
}

function parsePayload(payload: unknown): ProjectTemplatePayload {
  const parsed = projectTemplatePayloadSchema.safeParse(payload)
  if (!parsed.success) {
    throw new ProjectsFailure('invalid', 'Template payload is invalid')
  }
  return parsed.data
}

/** Справочники шаблона: пустые списки остаются на дефолтах projectSettingsSchema. */
function settingsFromPayload(payload: ProjectTemplatePayload): ProjectSettings {
  return projectSettingsSchema.parse({
    ...(payload.dictionaries.findingCategories.length > 0
      ? { findingCategories: payload.dictionaries.findingCategories }
      : {}),
    ...(payload.dictionaries.findingPriorities.length > 0
      ? { findingPriorities: payload.dictionaries.findingPriorities }
      : {}),
    ...(payload.dictionaries.findingStatuses.length > 0 ? { findingStatuses: payload.dictionaries.findingStatuses } : {}),
    ...(payload.dictionaries.factTypes.length > 0 ? { factTypes: payload.dictionaries.factTypes } : {}),
    passportFields: payload.dictionaries.passportFields,
  })
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function isRecordNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}
