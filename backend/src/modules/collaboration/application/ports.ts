import type { NotificationThread, ThreadType } from '@ordiks-survey/contracts'

export type Clock = {
  now(): Date
}

export type CommentRow = {
  id: string
  projectId: string
  threadType: ThreadType
  threadId: string
  authorId: string
  authorName: string | null
  authorEmail: string
  body: string
  needsAnswer: boolean
  createdAt: Date
  updatedAt: Date
}

export type ProjectRefRow = {
  id: string
  name: string
  client: string
}

export type CollaborationRepository = {
  listCommentsOfThread(projectId: string, threadType: ThreadType, threadId: string): Promise<CommentRow[]>

  createComment(input: Omit<CommentRow, 'id' | 'createdAt' | 'updatedAt' | 'authorName' | 'authorEmail'>): Promise<CommentRow>

  findCommentById(commentId: string): Promise<CommentRow | null>

  updateCommentBody(commentId: string, body: string): Promise<CommentRow | null>

  deleteComment(commentId: string): Promise<boolean>

  /** Существует ли объект треда и принадлежит ли он проекту. */
  threadBelongsToProject(threadType: ThreadType, threadId: string, projectId: string): Promise<boolean>

  /** Заголовок и маршрут треда для центра уведомлений; null, если объект исчез. */
  findThreadInfo(threadType: ThreadType, threadId: string): Promise<(NotificationThread & { projectId: string }) | null>

  /// Проекты, доступные пользователю: команда — все, клиент — по членству.
  listAccessibleProjects(userId: string, orgRole: string): Promise<ProjectRefRow[]>

  /// Комментарии доступных проектов, новее ThreadRead пользователя и не от него.
  listUnreadComments(userId: string, projectIds: string[]): Promise<CommentRow[]>

  upsertThreadRead(userId: string, threadType: ThreadType, threadId: string, lastReadAt: Date): Promise<void>
}
