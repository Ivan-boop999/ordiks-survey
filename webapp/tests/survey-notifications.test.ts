import { describe, expect, test } from 'bun:test'
import type { NotificationItem } from '@ordiks-survey/contracts'

import {
  notificationExcerpt,
  notificationHeadline,
  notificationTargetPath,
  withoutThread,
} from '../src/features/survey/notifications-model'

function item(overrides: {
  threadType: string
  threadId: string
  route: string
  threadTitle?: string
  body?: string
  authorName?: string | null
  commentId?: string
}): NotificationItem {
  return {
    comment: {
      id: overrides.commentId ?? 'c1',
      projectId: 'proj-1',
      threadType: overrides.threadType as NotificationItem['comment']['threadType'],
      threadId: overrides.threadId,
      authorId: 'u2',
      authorName: overrides.authorName ?? null,
      authorEmail: 'petr@client.example',
      body: overrides.body ?? 'Посмотрите таблицу',
      needsAnswer: false,
      createdAt: '2026-10-10T09:00:00.000Z',
      updatedAt: '2026-10-10T09:00:00.000Z',
    },
    thread: {
      threadType: overrides.threadType as NotificationItem['thread']['threadType'],
      threadId: overrides.threadId,
      title: overrides.threadTitle ?? 'Факт: стеллаж №4',
      route: overrides.route as NotificationItem['thread']['route'],
    },
    project: { id: 'proj-1', name: 'Обследование Ромашки', client: 'ООО «Ромашка»' },
  }
}

describe('маршруты уведомлений', () => {
  test('route ведёт в раздел обследования проекта', () => {
    expect(notificationTargetPath('facts', 'p1')).toBe('/survey/p/p1/facts')
    expect(notificationTargetPath('findings', 'p1')).toBe('/survey/p/p1/findings')
    expect(notificationTargetPath('interviews', 'p1')).toBe('/survey/p/p1/interviews')
    expect(notificationTargetPath('plan', 'p1')).toBe('/survey/p/p1/plan')
    expect(notificationTargetPath('domains', 'p1')).toBe('/survey/p/p1/domains')
    expect(notificationTargetPath('requests', 'p1')).toBe('/survey/p/p1/requests')
    expect(notificationTargetPath('report', 'p1')).toBe('/survey/p/p1/report')
    expect(notificationTargetPath('processes', 'p1')).toBe('/survey/p/p1/processes')
  })

  test('неизвестный маршрут ведёт на дашборд', () => {
    expect(notificationTargetPath('something-new', 'p1')).toBe('/survey/p/p1/dashboard')
  })

  test('route registries ведёт в раздел своих реестров', () => {
    expect(notificationTargetPath('registries', 'p1')).toBe('/survey/p/p1/registries')
  })
})

describe('гашение уведомлений', () => {
  test('withoutThread убирает только прочитанный тред', () => {
    const factThread = item({ threadType: 'fact', threadId: 'f1', route: 'facts' })
    const sameThreadOtherComment = item({
      threadType: 'fact',
      threadId: 'f1',
      route: 'facts',
      commentId: 'c2',
    })
    const reportThread = item({ threadType: 'report', threadId: 'r1', route: 'report' })
    const rest = withoutThread([factThread, sameThreadOtherComment, reportThread], 'fact', 'f1')
    expect(rest).toEqual([reportThread])

    // Чужой threadId не гасит чужие уведомления.
    expect(withoutThread([factThread], 'fact', 'f2')).toEqual([factThread])
    // Другой тип треда с тем же id не задевается.
    expect(withoutThread([reportThread], 'fact', 'r1')).toEqual([reportThread])
  })
})

describe('текст пункта', () => {
  test('заголовок «Автор → Объект», имя подставляется из email при отсутствии', () => {
    expect(notificationHeadline(item({ threadType: 'fact', threadId: 'f1', route: 'facts', authorName: 'Пётр' }))).toBe(
      'Пётр → Факт: стеллаж №4',
    )
    expect(notificationHeadline(item({ threadType: 'fact', threadId: 'f1', route: 'facts' }))).toBe(
      'petr → Факт: стеллаж №4',
    )
  })

  test('excerpt схлопывает переводы строк и обрезает длинный текст', () => {
    expect(notificationExcerpt('строка 1\n  строка 2')).toBe('строка 1 строка 2')
    const long = 'а'.repeat(200)
    const cut = notificationExcerpt(long, 100)
    expect(cut.length).toBe(100)
    expect(cut.endsWith('…')).toBe(true)
    expect(notificationExcerpt('коротко')).toBe('коротко')
  })
})
