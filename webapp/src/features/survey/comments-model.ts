import type { CommentDto, ProjectMemberDto } from '@ordiks-survey/contracts'

import { MEMBER_ROLE_LABELS, type SurveyViewRole } from './model'

// ============================================================
// Комментарии-треды: чистая логика прав и подписей — экран и
// тесты считают одинаково (правило как access.comment на сервере).
// ============================================================

/** Писать в треды могут все роли, кроме наблюдателя (он читает). */
export function canWriteComments(viewRole: SurveyViewRole): boolean {
  return viewRole !== 'observer'
}

/** Роль автора по списку участников проекта; вне списка (глобальная команда) — «ОРДИКС». */
export function commentRoleLabel(
  comment: Pick<CommentDto, 'authorId'>,
  members: ReadonlyArray<Pick<ProjectMemberDto, 'userId' | 'role'>>,
): string {
  const role = members.find((member) => member.userId === comment.authorId)?.role
  return role ? MEMBER_ROLE_LABELS[role] : 'ОРДИКС'
}
