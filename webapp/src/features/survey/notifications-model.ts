import type { NotificationItem } from '@ordiks-survey/contracts'

import { isSurveySection, sectionPath } from './model'

// ============================================================
// Центр уведомлений: чистая логика маршрутов и «гашения» тредов —
// экран и тесты считают переход/список одинаково (ROUTE_BY_THREAD прототипа).
// ============================================================

/**
 * Маршрут уведомления → раздел обследования; неизвестные ведут на дашборд.
 * С threadId добавляет ?focus=: страница раздела открывает диалог нужного объекта
 * (тред прикреплён к объекту — threadId и есть id факта/находки/интервью/запроса).
 */
export function notificationTargetPath(
  route: string,
  projectId: string,
  threadId?: string,
): string {
  const section = isSurveySection(route) ? route : 'dashboard'
  const base = sectionPath(projectId, section)
  return threadId ? `${base}?focus=${encodeURIComponent(threadId)}` : base
}

/** Читает ?focus= из строки поиска (id объекта, к которому ведёт уведомление). */
export function focusIdFromSearch(searchStr: string): string | null {
  const raw = new URLSearchParams(searchStr).get('focus')
  return raw && raw.length > 0 ? raw : null
}

/** Убирает тред из списка непрочитанных (после отметки прочитанным). */
export function withoutThread(
  items: readonly NotificationItem[],
  threadType: string,
  threadId: string,
): NotificationItem[] {
  return items.filter(
    (item) => !(item.thread.threadType === threadType && item.thread.threadId === threadId),
  )
}

/** Строка «Автор → Объект» для пункта поповера. */
export function notificationHeadline(item: NotificationItem): string {
  const author = item.comment.authorName ?? item.comment.authorEmail.split('@')[0] ?? item.comment.authorEmail
  return `${author} → ${item.thread.title}`
}

/** Короткий текст комментария для списка (одна строка). */
export function notificationExcerpt(body: string, max = 120): string {
  const single = body.replace(/\s+/g, ' ').trim()
  return single.length > max ? `${single.slice(0, max - 1)}…` : single
}
