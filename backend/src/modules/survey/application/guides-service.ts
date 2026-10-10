import type {
  CreateGuideQuestionRequest,
  CreateGuideRequest,
  CreateGuideSectionRequest,
  GuideDto,
  UpdateGuideQuestionRequest,
  UpdateGuideRequest,
  UpdateGuideSectionRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import { SurveyFailure } from '../domain/errors'
import type {
  GuideQuestionRow,
  GuideSectionRow,
  GuideTreeRow,
  SurveyRepository,
} from './ports'

type GuidesServiceDependencies = {
  guard: ProjectAccessGuard
  repository: SurveyRepository
}

type QuestionRef = {
  /// Уникальный ключ вопроса внутри проверяемого набора: реальный id или клиентский ref.
  ref: string
  type: string
  options: string[]
  sourceRef: string | null
  showIfValue: string | null
}

/**
 * Гайды (опросники): секции, вопросы, условный показ, дубль с перевязкой showIf.
 * Всё, кроме чтения, — только команда (edit).
 */
export class GuidesService {
  constructor(private readonly dependencies: GuidesServiceDependencies) {}

  async listGuides(principal: AuthenticatedPrincipal, projectId: string): Promise<GuideDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listGuides(projectId)).map(guideDto)
  }

  async getGuide(principal: AuthenticatedPrincipal, guideId: string): Promise<GuideDto> {
    const guide = await this.findGuideTree(guideId)
    await this.dependencies.guard.requireView(principal.id, guide.projectId)
    return guideDto(guide)
  }

  async createGuide(principal: AuthenticatedPrincipal, projectId: string, input: CreateGuideRequest): Promise<GuideDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)

    const refs = new Map<string, number>()
    const questions: QuestionRef[] = []
    for (const section of input.sections) {
      for (const question of section.questions) {
        // Без клиентского id сослаться на вопрос нельзя — ключ не нужен; генерируем уникальный.
        const ref = question.id ?? `new-${questions.length}`
        if (refs.has(ref)) {
          throw new SurveyFailure('invalid', 'Question ids inside one guide must be unique')
        }
        refs.set(ref, questions.length)
        questions.push({
          ref,
          type: question.type,
          options: question.options,
          sourceRef: question.showIfQuestionId ?? null,
          showIfValue: question.showIfValue ?? null,
        })
      }
    }
    this.assertConditionalTree(questions)

    const row = await this.dependencies.repository.createGuide({
      projectId,
      name: input.name,
      sections: input.sections.map((section, sectionIndex) => ({
        title: section.title,
        sortOrder: section.sortOrder ?? sectionIndex,
        questions: section.questions.map((question, questionIndex) => ({
          clientRefId: question.id ?? null,
          type: question.type,
          text: question.text,
          options: question.type === 'choice' || question.type === 'multi' ? question.options : [],
          showIfClientRefId: question.showIfQuestionId ?? null,
          showIfValue: question.showIfQuestionId ? (question.showIfValue ?? null) : null,
          sortOrder: question.sortOrder ?? questionIndex,
        })),
      })),
    })
    return guideDto(row)
  }

  async updateGuide(principal: AuthenticatedPrincipal, guideId: string, input: UpdateGuideRequest): Promise<GuideDto> {
    const guide = await this.findGuide(guideId)
    await this.dependencies.guard.requireEdit(principal.id, guide.projectId)
    await this.dependencies.repository.updateGuide(guideId, { ...input })
    return this.findGuideTreeDto(guideId)
  }

  async deleteGuide(principal: AuthenticatedPrincipal, guideId: string): Promise<void> {
    const guide = await this.findGuide(guideId)
    await this.dependencies.guard.requireEdit(principal.id, guide.projectId)
    await this.dependencies.repository.deleteGuide(guideId)
  }

  /** Дубль: копия с новыми id, showIf перевязываются на новые id исходников (как в прототипе). */
  async duplicateGuide(principal: AuthenticatedPrincipal, guideId: string): Promise<GuideDto> {
    const guide = await this.findGuideTree(guideId)
    await this.dependencies.guard.requireEdit(principal.id, guide.projectId)
    const copy = await this.dependencies.repository.copyGuide(guideId, `${guide.name} (копия)`)
    return guideDto(copy)
  }

  async createSection(principal: AuthenticatedPrincipal, guideId: string, input: CreateGuideSectionRequest): Promise<GuideDto> {
    const guide = await this.findGuideTree(guideId)
    await this.dependencies.guard.requireEdit(principal.id, guide.projectId)
    const nextOrder = input.sortOrder
      ?? nextSortOrder(guide.sections.map((section) => section.sortOrder))
    await this.dependencies.repository.createGuideSection({ guideId, title: input.title, sortOrder: nextOrder })
    return this.findGuideTreeDto(guideId)
  }

  async updateSection(principal: AuthenticatedPrincipal, sectionId: string, input: UpdateGuideSectionRequest): Promise<GuideDto> {
    const section = await this.findSection(sectionId)
    const guide = await this.findGuide(section.guideId)
    await this.dependencies.guard.requireEdit(principal.id, guide.projectId)
    await this.dependencies.repository.updateGuideSection(sectionId, { ...input })
    return this.findGuideTreeDto(section.guideId)
  }

  async deleteSection(principal: AuthenticatedPrincipal, sectionId: string): Promise<void> {
    const section = await this.findSection(sectionId)
    const guide = await this.findGuide(section.guideId)
    await this.dependencies.guard.requireEdit(principal.id, guide.projectId)
    await this.dependencies.repository.deleteGuideSection(sectionId)
  }

  async createQuestion(principal: AuthenticatedPrincipal, sectionId: string, input: CreateGuideQuestionRequest): Promise<GuideDto> {
    const section = await this.findSection(sectionId)
    const guide = await this.findGuideTree(section.guideId)
    await this.dependencies.guard.requireEdit(principal.id, guide.projectId)

    const questions = this.questionRefs(guide)
    questions.push({
      ref: 'new',
      type: input.type,
      options: input.options,
      sourceRef: input.showIfQuestionId ?? null,
      showIfValue: input.showIfValue ?? null,
    })
    this.assertConditionalTree(questions)

    await this.dependencies.repository.createGuideQuestion({
      sectionId,
      type: input.type,
      text: input.text,
      options: input.type === 'choice' || input.type === 'multi' ? input.options : [],
      showIfQuestionId: input.showIfQuestionId ?? null,
      showIfValue: input.showIfQuestionId ? (input.showIfValue ?? null) : null,
      sortOrder: input.sortOrder ?? nextSortOrder(section.questions.map((question) => question.sortOrder)),
    })
    return guideDto(await this.findGuideTree(section.guideId))
  }

  async updateQuestion(principal: AuthenticatedPrincipal, questionId: string, input: UpdateGuideQuestionRequest): Promise<GuideDto> {
    const question = await this.findQuestion(questionId)
    const guide = await this.findGuideTree(question.section.guideId)
    await this.dependencies.guard.requireEdit(principal.id, guide.projectId)

    const type = input.type ?? (question.type as CreateGuideQuestionRequest['type'])
    const sourceRef = input.showIfQuestionId === undefined ? question.showIfQuestionId : input.showIfQuestionId ?? null
    const showIfValue = input.showIfValue === undefined ? question.showIfValue : input.showIfValue ?? null
    const options = input.options !== undefined
      ? (type === 'choice' || type === 'multi' ? input.options : [])
      : (type === 'choice' || type === 'multi' ? question.options : [])

    const questions = this.questionRefs(guide).map((ref) =>
      ref.ref === questionId ? { ...ref, type, options, sourceRef, showIfValue } : ref,
    )
    this.assertConditionalTree(questions)

    await this.dependencies.repository.updateGuideQuestion(questionId, {
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      type,
      options,
      showIfQuestionId: sourceRef && showIfValue ? sourceRef : null,
      showIfValue: sourceRef && showIfValue ? showIfValue : null,
    })
    return guideDto(await this.findGuideTree(question.section.guideId))
  }

  async deleteQuestion(principal: AuthenticatedPrincipal, questionId: string): Promise<void> {
    const question = await this.findQuestion(questionId)
    const guide = await this.findGuideTree(question.section.guideId)
    await this.dependencies.guard.requireEdit(principal.id, guide.projectId)
    // Зависимые вопросы теряют условие (SetNull в схеме) и показываются безусловно — как в прототипе.
    await this.dependencies.repository.deleteGuideQuestion(questionId)
  }

  /// Плоский список вопросов гайда в порядке следования (для проверок условий).
  private questionRefs(guide: GuideTreeRow): QuestionRef[] {
    return guide.sections.flatMap((section) =>
      section.questions.map((question) => ({
        ref: question.id,
        type: question.type,
        options: question.options,
        sourceRef: question.showIfQuestionId,
        showIfValue: question.showIfValue,
      })),
    )
  }

  /**
   * Правила условного показа (прототип: условие предлагает только предыдущие вопросы):
   * - choice/multi требуют хотя бы один вариант;
   * - источник условия существует в этом же гайде и идёт раньше зависимого;
   * - источник сам не условный (иначе видимость зависела бы от ответа на скрытый вопрос);
   * - условие задаётся парой источник+значение.
   */
  private assertConditionalTree(questions: QuestionRef[]) {
    const indexOfRef = new Map(questions.map((question, index) => [question.ref, index]))

    questions.forEach((question, index) => {
      if ((question.type === 'choice' || question.type === 'multi') && question.options.length === 0) {
        throw new SurveyFailure('invalid', 'Choice and multi questions require at least one option')
      }
      if (!question.sourceRef) return
      if (!question.showIfValue) {
        throw new SurveyFailure('invalid', 'A conditional question needs both a source question and a value')
      }
      const sourceIndex = indexOfRef.get(question.sourceRef)
      if (sourceIndex === undefined) {
        throw new SurveyFailure('invalid', 'Conditional source question is not in this guide')
      }
      if (sourceIndex >= index) {
        throw new SurveyFailure('invalid', 'A conditional question must come after its source question')
      }
      if (questions[sourceIndex].sourceRef) {
        throw new SurveyFailure('invalid', 'A conditional question cannot depend on another conditional question')
      }
    })
  }

  private async findGuideTree(guideId: string): Promise<GuideTreeRow> {
    const guide = await this.dependencies.repository.findGuideTreeById(guideId)
    if (!guide) throw new SurveyFailure('not_found', 'Guide not found')
    return guide
  }

  private async findGuide(guideId: string) {
    const guide = await this.dependencies.repository.findGuideById(guideId)
    if (!guide) throw new SurveyFailure('not_found', 'Guide not found')
    return guide
  }

  private async findGuideTreeDto(guideId: string): Promise<GuideDto> {
    return guideDto(await this.findGuideTree(guideId))
  }

  private async findSection(sectionId: string): Promise<GuideSectionRow & { questions: GuideQuestionRow[] }> {
    const section = await this.dependencies.repository.findGuideSectionById(sectionId)
    if (!section) throw new SurveyFailure('not_found', 'Guide section not found')
    return section
  }

  private async findQuestion(questionId: string): Promise<GuideQuestionRow & { section: GuideSectionRow }> {
    const question = await this.dependencies.repository.findGuideQuestionById(questionId)
    if (!question) throw new SurveyFailure('not_found', 'Guide question not found')
    return question
  }
}

function nextSortOrder(orders: number[]): number {
  return orders.reduce((maximum, order) => Math.max(maximum, order + 1), 0)
}

export function guideDto(row: GuideTreeRow): GuideDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    sections: row.sections.map((section) => ({
      id: section.id,
      guideId: section.guideId,
      title: section.title,
      sortOrder: section.sortOrder,
      questions: section.questions.map((question) => ({
        id: question.id,
        sectionId: question.sectionId,
        type: question.type as GuideDto['sections'][number]['questions'][number]['type'],
        text: question.text,
        options: question.options,
        showIfQuestionId: question.showIfQuestionId,
        showIfValue: question.showIfValue,
        sortOrder: question.sortOrder,
      })),
    })),
  }
}
