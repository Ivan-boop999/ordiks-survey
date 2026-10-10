import type {
  CreateInterviewRequest,
  GuideQuestionType,
  InterviewDetailDto,
  InterviewDto,
  InterviewsQuery,
  SaveInterviewAnswersRequest,
  SaveInterviewAnswersResponse,
  UpdateInterviewRequest,
} from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import { buildAnswerBatch } from '../domain/answers'
import { SurveyFailure } from '../domain/errors'
import type { InterviewRow, SurveyRepository } from './ports'

type InterviewsServiceDependencies = {
  guard: ProjectAccessGuard
  repository: SurveyRepository
}

/**
 * Интервью: CRUD и save-батч ответов по гайду. «Создать находку из интервью» — не отдельный
 * эндпоинт: фронт зовёт POST /findings с предзаполнением из конспекта.
 */
export class InterviewsService {
  constructor(private readonly dependencies: InterviewsServiceDependencies) {}

  async listInterviews(principal: AuthenticatedPrincipal, projectId: string, query: InterviewsQuery): Promise<InterviewDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    return (await this.dependencies.repository.listInterviews(projectId, query)).map(interviewDto)
  }

  async getInterview(principal: AuthenticatedPrincipal, interviewId: string): Promise<InterviewDetailDto> {
    const interview = await this.findInterview(interviewId)
    await this.dependencies.guard.requireView(principal.id, interview.projectId)
    return interviewDetailDto(interview)
  }

  async createInterview(principal: AuthenticatedPrincipal, projectId: string, input: CreateInterviewRequest): Promise<InterviewDetailDto> {
    await this.dependencies.guard.requireEdit(principal.id, projectId)
    await this.assertLinks(projectId, input.domainId ?? null, input.guideId ?? null)

    const row = await this.dependencies.repository.createInterview({
      projectId,
      domainId: input.domainId ?? null,
      guideId: input.guideId ?? null,
      scheduledAt: input.scheduledAt,
      respondent: input.respondent,
      respondentRole: input.respondentRole,
      status: input.status ?? 'planned',
      notes: input.notes,
    })
    return interviewDetailDto({ ...row, answers: [] })
  }

  async updateInterview(principal: AuthenticatedPrincipal, interviewId: string, input: UpdateInterviewRequest): Promise<InterviewDetailDto> {
    const interview = await this.findInterview(interviewId)
    await this.dependencies.guard.requireEdit(principal.id, interview.projectId)
    const domainId = input.domainId === undefined ? interview.domainId : input.domainId ?? null
    const guideId = input.guideId === undefined ? interview.guideId : input.guideId ?? null
    await this.assertLinks(interview.projectId, domainId, guideId)

    const row = await this.dependencies.repository.updateInterview(interviewId, {
      ...input,
      domainId,
      guideId,
    })
    return row ? this.getInterviewDto(row.id) : interviewDetailDto(interview)
  }

  async deleteInterview(principal: AuthenticatedPrincipal, interviewId: string): Promise<void> {
    const interview = await this.findInterview(interviewId)
    await this.dependencies.guard.requireEdit(principal.id, interview.projectId)
    await this.dependencies.repository.deleteInterview(interviewId)
  }

  /**
   * Save-батч: полная замена ответов. Условные вопросы без выполненного условия отбрасываются
   * (как в прототипе), значения проверяются по типам вопросов гайда.
   */
  async saveAnswers(
    principal: AuthenticatedPrincipal,
    interviewId: string,
    input: SaveInterviewAnswersRequest,
  ): Promise<SaveInterviewAnswersResponse> {
    const interview = await this.findInterview(interviewId)
    await this.dependencies.guard.requireEdit(principal.id, interview.projectId)

    const guide = await this.requireGuide(interview)
    const orderedQuestions = guide.sections.flatMap((section) => section.questions)
    const batch = buildAnswerBatch(
      orderedQuestions.map((question) => ({
        id: question.id,
        type: question.type as GuideQuestionType,
        options: question.options,
        showIfQuestionId: question.showIfQuestionId,
        showIfValue: question.showIfValue,
      })),
      input.answers,
    )
    if (!batch.ok) {
      throw new SurveyFailure(
        'invalid',
        batch.errors.map((error) => `Question ${error.questionId}: ${error.message}`).join('; '),
      )
    }

    const answers = await this.dependencies.repository.replaceInterviewAnswers(
      interviewId,
      batch.result.answers,
    )
    return {
      interview: interviewDetailDto({ ...interview, answers }),
      saved: answers.length,
    }
  }

  private async requireGuide(interview: InterviewRow) {
    if (!interview.guideId) {
      throw new SurveyFailure('invalid', 'Interview has no guide attached')
    }
    const guide = await this.dependencies.repository.findGuideTreeById(interview.guideId)
    if (!guide) throw new SurveyFailure('invalid', 'Interview guide no longer exists')
    return guide
  }

  private async assertLinks(projectId: string, domainId: string | null, guideId: string | null) {
    if (domainId != null) {
      const domain = await this.dependencies.repository.findDomainById(domainId)
      if (!domain || domain.projectId !== projectId) {
        throw new SurveyFailure('invalid', 'Domain does not belong to this project')
      }
    }
    if (guideId != null) {
      const guide = await this.dependencies.repository.findGuideById(guideId)
      if (!guide || guide.projectId !== projectId) {
        throw new SurveyFailure('invalid', 'Guide does not belong to this project')
      }
    }
  }

  private async getInterviewDto(interviewId: string): Promise<InterviewDetailDto> {
    return interviewDetailDto(await this.findInterview(interviewId))
  }

  private async findInterview(interviewId: string) {
    const interview = await this.dependencies.repository.findInterviewById(interviewId)
    if (!interview) throw new SurveyFailure('not_found', 'Interview not found')
    return interview
  }
}

export function interviewDto(row: InterviewRow): InterviewDto {
  return {
    id: row.id,
    projectId: row.projectId,
    domainId: row.domainId,
    guideId: row.guideId,
    scheduledAt: row.scheduledAt.toISOString(),
    respondent: row.respondent,
    respondentRole: row.respondentRole,
    status: row.status,
    notes: row.notes,
  }
}

export function interviewDetailDto(row: InterviewRow & { answers: Array<{ questionId: string; value: unknown }> }): InterviewDetailDto {
  return {
    ...interviewDto(row),
    answers: row.answers.map((answer) => ({
      questionId: answer.questionId,
      value: answer.value,
    })) as InterviewDetailDto['answers'],
  }
}
