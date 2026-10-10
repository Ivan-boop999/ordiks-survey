import {
  projectSettingsSchema,
  type FactsQuery,
  type FindingsQuery,
  type InterviewsQuery,
  type ProjectSettings,
} from '@ordiks-survey/contracts'

import type { DbClient } from '../../../db'
import { Prisma } from '../../../generated/prisma/client'
import { SurveyFailure } from '../domain/errors'
import type {
  CreateGuideWrite,
  DataRequestRow,
  FactRow,
  FactWithFindingsRow,
  FindingRow,
  GuideQuestionRow,
  GuideRow,
  GuideSectionRow,
  GuideTreeRow,
  InterviewAnswerRow,
  InterviewDetailRow,
  InterviewRow,
  SurveyRepository,
} from '../application/ports'

const orderById = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }]

const questionOrder = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }]

const guideTreeInclude = {
  sections: {
    orderBy: orderById,
    include: { questions: { orderBy: questionOrder } },
  },
} as const

/** Settings пишутся через ту же Zod-схему, что читает контракты; мусор в JSON не должен ронять чтение. */
function parseSettings(raw: unknown): ProjectSettings {
  const result = projectSettingsSchema.safeParse(raw ?? {})
  return result.success ? result.data : projectSettingsSchema.parse({})
}

function optionsOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
}

export function createPrismaSurveyRepository(db: DbClient): SurveyRepository {
  return {
    findProjectSettings(projectId) {
      return db.project
        .findUnique({ where: { id: projectId }, select: { settings: true } })
        .then((row) => (row ? parseSettings(row.settings) : null))
    },

    findDomainById(domainId) {
      return db.domain.findUnique({
        where: { id: domainId },
        select: { id: true, projectId: true },
      })
    },

    findMemberRole(projectId, userId) {
      return db.projectMember
        .findUnique({
          where: { projectId_userId: { projectId, userId } },
          select: { role: true },
        })
        .then((row) => row?.role ?? null)
    },

    // --------------------------------------------------------
    // Факты
    // --------------------------------------------------------

    listFacts(projectId, query: FactsQuery) {
      return db.fact
        .findMany({
          where: {
            projectId,
            ...(query.domainId === undefined ? {} : { domainId: query.domainId }),
            ...(query.shop === undefined ? {} : { shop: query.shop }),
            ...(query.authorId === undefined ? {} : { authorId: query.authorId }),
            ...(query.kind === undefined ? {} : { kind: query.kind }),
            ...(query.typeKey === undefined ? {} : { typeKey: query.typeKey }),
            ...(query.q === undefined
              ? {}
              : {
                  OR: [
                    { title: { contains: query.q, mode: 'insensitive' } },
                    { description: { contains: query.q, mode: 'insensitive' } },
                  ],
                }),
          },
          include: { findings: { select: { id: true, title: true, status: true } } },
          orderBy: [{ factDate: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'asc' as const }],
        })
        .then((rows) => rows.map(toFactWithFindingsRow))
    },

    createFact(input) {
      return db.fact.create({ data: input }).then(toFactRow)
    },

    findFactById(factId) {
      return db.fact.findUnique({ where: { id: factId } }).then((row) => (row ? toFactRow(row) : null))
    },

    findFactWithFindingsById(factId) {
      return db.fact
        .findUnique({
          where: { id: factId },
          include: { findings: { select: { id: true, title: true, status: true } } },
        })
        .then((row) => (row ? toFactWithFindingsRow(row) : null))
    },

    updateFact(factId, data) {
      return db.fact
        .update({ where: { id: factId }, data })
        .then(toFactRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteFact(factId) {
      return db.fact
        .delete({ where: { id: factId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    // --------------------------------------------------------
    // Гайды
    // --------------------------------------------------------

    listGuides(projectId) {
      return db.guide
        .findMany({ where: { projectId }, orderBy: { createdAt: 'asc' }, include: guideTreeInclude })
        .then((rows) => rows.map(toGuideTreeRow))
    },

    findGuideTreeById(guideId) {
      return db.guide
        .findUnique({ where: { id: guideId }, include: guideTreeInclude })
        .then((row) => (row ? toGuideTreeRow(row) : null))
    },

    findGuideById(guideId) {
      return db.guide
        .findUnique({ where: { id: guideId }, select: { id: true, projectId: true, name: true, createdAt: true } })
        .then((row) => (row ? { ...row, createdAt: row.createdAt } : null))
    },

    async createGuide(input: CreateGuideWrite) {
      // Первый проход: секции и вопросы без условий, запоминаем новые id; второй: перевязка
      // showIf на новые id исходников (nid() прототипа).
      const created = await db.$transaction(async (tx) => {
        const guide = await tx.guide.create({
          data: { projectId: input.projectId, name: input.name },
        })
        const refToQuestionId = new Map<string, string>()
        const createdWithConditions: Array<{
          id: string
          showIfClientRefId: string
          showIfValue: string
        }> = []

        for (const section of input.sections) {
          const createdSection = await tx.guideSection.create({
            data: { guideId: guide.id, title: section.title, sortOrder: section.sortOrder },
          })
          for (const question of section.questions) {
            const createdQuestion = await tx.guideQuestion.create({
              data: {
                sectionId: createdSection.id,
                type: question.type,
                text: question.text,
                options: question.options,
                sortOrder: question.sortOrder,
              },
            })
            if (question.clientRefId) refToQuestionId.set(question.clientRefId, createdQuestion.id)
            if (question.showIfClientRefId && question.showIfValue) {
              createdWithConditions.push({
                id: createdQuestion.id,
                showIfClientRefId: question.showIfClientRefId,
                showIfValue: question.showIfValue,
              })
            }
          }
        }

        for (const pending of createdWithConditions) {
          const sourceId = refToQuestionId.get(pending.showIfClientRefId)
          if (!sourceId) continue
          await tx.guideQuestion.update({
            where: { id: pending.id },
            data: { showIfQuestionId: sourceId, showIfValue: pending.showIfValue },
          })
        }

        return guide
      })

      const tree = await db.guide.findUnique({ where: { id: created.id }, include: guideTreeInclude })
      return toGuideTreeRow(tree ?? { ...created, sections: [] })
    },

    updateGuide(guideId, data) {
      return db.guide
        .update({ where: { id: guideId }, data })
        .then((row) => ({ id: row.id, projectId: row.projectId, name: row.name, createdAt: row.createdAt }))
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteGuide(guideId) {
      return db.guide
        .delete({ where: { id: guideId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    createGuideSection(input) {
      return db.guideSection.create({ data: input }).then(toSectionRow)
    },

    findGuideSectionById(sectionId) {
      return db.guideSection
        .findUnique({ where: { id: sectionId }, include: { questions: { orderBy: questionOrder } } })
        .then((row) => (row ? { ...toSectionRow(row), questions: row.questions.map(toQuestionRow) } : null))
    },

    updateGuideSection(sectionId, data) {
      return db.guideSection
        .update({ where: { id: sectionId }, data })
        .then(toSectionRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteGuideSection(sectionId) {
      return db.guideSection
        .delete({ where: { id: sectionId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    createGuideQuestion(input) {
      return db.guideQuestion
        .create({
          data: {
            sectionId: input.sectionId,
            type: input.type,
            text: input.text,
            options: input.options,
            showIfQuestionId: input.showIfQuestionId,
            showIfValue: input.showIfValue,
            sortOrder: input.sortOrder,
          },
        })
        .then(toQuestionRow)
    },

    findGuideQuestionById(questionId) {
      return db.guideQuestion
        .findUnique({ where: { id: questionId }, include: { section: true } })
        .then((row) => (row ? { ...toQuestionRow(row), section: toSectionRow(row.section) } : null))
    },

    updateGuideQuestion(questionId, data) {
      return db.guideQuestion
        .update({
          where: { id: questionId },
          data: {
            ...(data.type !== undefined ? { type: data.type } : {}),
            ...(data.text !== undefined ? { text: data.text } : {}),
            ...(data.options !== undefined ? { options: data.options } : {}),
            ...(data.showIfQuestionId !== undefined ? { showIfQuestionId: data.showIfQuestionId } : {}),
            ...(data.showIfValue !== undefined ? { showIfValue: data.showIfValue } : {}),
            ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          },
        })
        .then(toQuestionRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteGuideQuestion(questionId) {
      return db.guideQuestion
        .delete({ where: { id: questionId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    async copyGuide(guideId, name) {
      const source = await db.guide.findUnique({ where: { id: guideId }, include: guideTreeInclude })
      if (!source) throw new SurveyFailure('not_found', 'Guide not found')

      return db.$transaction(async (tx) => {
        const copy = await tx.guide.create({ data: { projectId: source.projectId, name } })
        const oldToNew = new Map<string, string>()

        for (const section of source.sections) {
          const createdSection = await tx.guideSection.create({
            data: { guideId: copy.id, title: section.title, sortOrder: section.sortOrder },
          })
          for (const question of section.questions) {
            const createdQuestion = await tx.guideQuestion.create({
              data: {
                sectionId: createdSection.id,
                type: question.type,
                text: question.text,
                options: optionsOf(question.options),
                sortOrder: question.sortOrder,
              },
            })
            oldToNew.set(question.id, createdQuestion.id)
          }
        }
        // Перевязка showIf: новому вопросу — новый id исходника (nid() прототипа).
        for (const section of source.sections) {
          for (const question of section.questions) {
            if (!question.showIfQuestionId || !question.showIfValue) continue
            const newId = oldToNew.get(question.id)
            const newSourceId = oldToNew.get(question.showIfQuestionId)
            if (!newId || !newSourceId) continue
            await tx.guideQuestion.update({
              where: { id: newId },
              data: { showIfQuestionId: newSourceId, showIfValue: question.showIfValue },
            })
          }
        }

        const tree = await tx.guide.findUnique({ where: { id: copy.id }, include: guideTreeInclude })
        if (!tree) throw new SurveyFailure('conflict', 'Guide copy disappeared')
        return toGuideTreeRow(tree)
      })
    },

    // --------------------------------------------------------
    // Интервью
    // --------------------------------------------------------

    listInterviews(projectId, query: InterviewsQuery) {
      return db.interview.findMany({
        where: {
          projectId,
          ...(query.status === undefined ? {} : { status: query.status }),
          ...(query.domainId === undefined ? {} : { domainId: query.domainId }),
        },
        orderBy: [{ scheduledAt: 'desc' as const }, { id: 'asc' as const }],
      }) as Promise<InterviewRow[]>
    },

    createInterview(input) {
      return db.interview.create({ data: input }) as Promise<InterviewRow>
    },

    findInterviewById(interviewId) {
      return db.interview
        .findUnique({
          where: { id: interviewId },
          include: { answers: { orderBy: { questionId: 'asc' } } },
        })
        .then((row) =>
          row
            ? {
                ...toInterviewRow(row),
                answers: row.answers.map((answer) => ({
                  questionId: answer.questionId,
                  value: answer.value,
                })),
            }
            : null,
        )
    },

    updateInterview(interviewId, data) {
      return db.interview
        .update({ where: { id: interviewId }, data })
        .then(toInterviewRow)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        })
    },

    deleteInterview(interviewId) {
      return db.interview
        .delete({ where: { id: interviewId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    async replaceInterviewAnswers(interviewId, answers: Array<{ questionId: string; value: unknown }>) {
      return db.$transaction(async (tx) => {
        await tx.interviewAnswer.deleteMany({ where: { interviewId } })
        for (const answer of answers) {
          await tx.interviewAnswer.create({
            data: { interviewId, questionId: answer.questionId, value: answer.value as Prisma.InputJsonValue },
          })
        }
        const rows = await tx.interviewAnswer.findMany({
          where: { interviewId },
          orderBy: { questionId: 'asc' },
        })
        return rows.map((row): InterviewAnswerRow => ({ questionId: row.questionId, value: row.value }))
      })
    },

    // --------------------------------------------------------
    // Запросы данных
    // --------------------------------------------------------

    listDataRequests(projectId) {
      return db.dataRequest.findMany({
        where: { projectId },
        orderBy: [{ deadline: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }],
      }) as Promise<DataRequestRow[]>
    },

    createDataRequest(input) {
      return db.dataRequest.create({ data: input }) as Promise<DataRequestRow>
    },

    findDataRequestById(requestId) {
      return db.dataRequest.findUnique({ where: { id: requestId } }) as Promise<DataRequestRow | null>
    },

    updateDataRequest(requestId, data) {
      return db.dataRequest
        .update({ where: { id: requestId }, data })
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        }) as Promise<DataRequestRow | null>
    },

    deleteDataRequest(requestId) {
      return db.dataRequest
        .delete({ where: { id: requestId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    // --------------------------------------------------------
    // Находки
    // --------------------------------------------------------

    listFindings(projectId, query: FindingsQuery) {
      return db.finding.findMany({
        where: {
          projectId,
          ...(query.domainId === undefined ? {} : { domainId: query.domainId }),
          ...(query.priority === undefined ? {} : { priority: query.priority }),
          ...(query.status === undefined ? {} : { status: query.status }),
        },
        orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }],
      }) as Promise<FindingRow[]>
    },

    createFinding(input) {
      return db.finding.create({ data: input }) as Promise<FindingRow>
    },

    findFindingById(findingId) {
      return db.finding.findUnique({ where: { id: findingId } }) as Promise<FindingRow | null>
    },

    updateFinding(findingId, data) {
      return db.finding
        .update({ where: { id: findingId }, data })
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return null
          throw error
        }) as Promise<FindingRow | null>
    },

    deleteFinding(findingId) {
      return db.finding
        .delete({ where: { id: findingId } })
        .then(() => true)
        .catch((error: unknown) => {
          if (isRecordNotFound(error)) return false
          throw error
        })
    },

    bulkUpdateFindingStatus(projectId, ids, status) {
      return db.finding
        .updateMany({ where: { id: { in: ids }, projectId }, data: { status } })
        .then((result) => result.count)
    },

    findFactByIdForProject(projectId, factId) {
      return db.fact.findUnique({ where: { id: factId }, select: { id: true, projectId: true } }).then((row) =>
        row && row.projectId === projectId ? { id: row.id } : null,
      )
    },

    findUserById(userId) {
      return db.user.findUnique({ where: { id: userId }, select: { id: true } })
    },
  }
}

function toFactRow(row: {
  id: string
  projectId: string
  domainId: string | null
  authorId: string
  kind: string
  typeKey: string
  title: string
  description: string
  shop: string
  factDate: Date
  objectKey: string | null
  fileName: string | null
  createdAt: Date
}): FactRow {
  return { ...row }
}

function toFactWithFindingsRow(
  row: Parameters<typeof toFactRow>[0] & {
    findings: Array<{ id: string; title: string; status: string }>
  },
): FactWithFindingsRow {
  return { ...toFactRow(row), findings: row.findings }
}

function toSectionRow(row: { id: string; guideId: string; title: string; sortOrder: number }): GuideSectionRow {
  return { id: row.id, guideId: row.guideId, title: row.title, sortOrder: row.sortOrder }
}

function toQuestionRow(row: {
  id: string
  sectionId: string
  type: string
  text: string
  options: unknown
  showIfQuestionId: string | null
  showIfValue: string | null
  sortOrder: number
}): GuideQuestionRow {
  return {
    id: row.id,
    sectionId: row.sectionId,
    type: row.type,
    text: row.text,
    options: optionsOf(row.options),
    showIfQuestionId: row.showIfQuestionId,
    showIfValue: row.showIfValue,
    sortOrder: row.sortOrder,
  }
}

function toGuideTreeRow(
  row: { id: string; projectId: string; name: string; createdAt: Date } & {
    sections: Array<Parameters<typeof toSectionRow>[0] & { questions: unknown[] }>
  },
): GuideTreeRow {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    createdAt: row.createdAt,
    sections: row.sections.map((section) => ({
      ...toSectionRow(section),
      questions: (section.questions as Array<Parameters<typeof toQuestionRow>[0]>).map(toQuestionRow),
    })),
  }
}

function toInterviewRow(row: {
  id: string
  projectId: string
  domainId: string | null
  guideId: string | null
  scheduledAt: Date
  respondent: string
  respondentRole: string
  status: string
  notes: string
}): InterviewRow {
  return {
    ...row,
    status: row.status as InterviewRow['status'],
  }
}

function isRecordNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}
