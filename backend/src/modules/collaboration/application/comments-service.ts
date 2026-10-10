import type { CommentDto, CommentsQuery, CreateCommentRequest, ThreadType, UpdateCommentRequest } from '@ordiks-survey/contracts'

import type { AuthenticatedPrincipal } from '../../auth'
import type { ProjectAccessGuard } from '../../projects'
import { CollaborationFailure } from '../domain/errors'
import type { Clock, CollaborationRepository, CommentRow } from './ports'

type CommentsServiceDependencies = {
  clock: Clock
  guard: ProjectAccessGuard
  repository: CollaborationRepository
}

/**
 * Комментарии-треды по объектам проекта (fact/finding/interview/task/request/domain/
 * process/report/registry_entry). Пишут все роли с правом комментария (команда +
 * client_lead/client_staff), observer читает; править/удалять — автор или команда.
 */
export class CommentsService {
  constructor(private readonly dependencies: CommentsServiceDependencies) {}

  async listThread(principal: AuthenticatedPrincipal, projectId: string, query: CommentsQuery): Promise<CommentDto[]> {
    await this.dependencies.guard.requireView(principal.id, projectId)
    await this.requireThreadInProject(projectId, query.threadType, query.threadId)
    return (await this.dependencies.repository.listCommentsOfThread(projectId, query.threadType, query.threadId)).map(commentDto)
  }

  async createComment(principal: AuthenticatedPrincipal, projectId: string, input: CreateCommentRequest): Promise<CommentDto> {
    const access = await this.dependencies.guard.context(principal.id, projectId)
    if (!access.comment) {
      // Наблюдатель знает о проекте — честный 403; постороннему — 404.
      throw new CollaborationFailure(
        access.view ? 'forbidden' : 'not_found',
        access.view ? 'Observers cannot comment' : 'Project not found',
      )
    }
    await this.requireThreadInProject(projectId, input.threadType, input.threadId)

    const row = await this.dependencies.repository.createComment({
      projectId,
      threadType: input.threadType,
      threadId: input.threadId,
      authorId: principal.id,
      body: input.body,
      needsAnswer: input.needsAnswer,
    })
    return commentDto(row)
  }

  async updateComment(principal: AuthenticatedPrincipal, commentId: string, input: UpdateCommentRequest): Promise<CommentDto> {
    const comment = await this.findComment(commentId)
    await this.requireAuthorOrTeam(principal, comment)
    const row = await this.dependencies.repository.updateCommentBody(commentId, input.body)
    return commentDto(row ?? comment)
  }

  async deleteComment(principal: AuthenticatedPrincipal, commentId: string): Promise<void> {
    const comment = await this.findComment(commentId)
    await this.requireAuthorOrTeam(principal, comment)
    await this.dependencies.repository.deleteComment(commentId)
  }

  /** Свой комментарий правит автор; любой — команда (edit = команда ОРДИКС). */
  private async requireAuthorOrTeam(principal: AuthenticatedPrincipal, comment: CommentRow) {
    const access = await this.dependencies.guard.context(principal.id, comment.projectId)
    if (access.edit || comment.authorId === principal.id) return
    throw new CollaborationFailure(
      access.view ? 'forbidden' : 'not_found',
      access.view ? 'Only the author and the Ordiks team can edit this comment' : 'Comment not found',
    )
  }

  /** Объект треда существует и лежит в этом проекте; тип и id проверяются парой. */
  private async requireThreadInProject(projectId: string, threadType: ThreadType, threadId: string) {
    const ok = await this.dependencies.repository.threadBelongsToProject(threadType, threadId, projectId)
    if (!ok) {
      throw new CollaborationFailure('invalid', `Thread object ${threadType}/${threadId} not found in this project`)
    }
  }

  private async findComment(commentId: string): Promise<CommentRow> {
    const comment = await this.dependencies.repository.findCommentById(commentId)
    if (!comment) throw new CollaborationFailure('not_found', 'Comment not found')
    return comment
  }
}

export function commentDto(row: CommentRow): CommentDto {
  return {
    id: row.id,
    projectId: row.projectId,
    threadType: row.threadType,
    threadId: row.threadId,
    authorId: row.authorId,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    body: row.body,
    needsAnswer: row.needsAnswer,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
