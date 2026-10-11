import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CommentDto, ProjectMemberDto } from '@ordiks-survey/contracts'

import { CommentCard } from '../src/features/survey/components/CommentThread'
import { canWriteComments, commentRoleLabel } from '../src/features/survey/comments-model'

function comment(overrides: Partial<CommentDto> = {}): CommentDto {
  return {
    id: 'c1',
    projectId: 'p1',
    threadType: 'fact',
    threadId: 'f1',
    authorId: 'u2',
    authorName: 'Пётр Смирнов',
    authorEmail: 'petr@demo.ordiks.ru',
    body: 'Посмотрите фото стеллажа',
    needsAnswer: false,
    createdAt: '2026-10-10T09:30:00.000Z',
    updatedAt: '2026-10-10T09:30:00.000Z',
    ...overrides,
  }
}

function member(userId: string, role: ProjectMemberDto['role']): ProjectMemberDto {
  return {
    id: `m-${userId}`,
    userId,
    role,
    email: `${userId}@demo.ordiks.ru`,
    displayName: null,
    createdAt: '2026-09-01T00:00:00.000Z',
  }
}

describe('права на комментарии', () => {
  test('пишут все роли кроме наблюдателя', () => {
    expect(canWriteComments('team')).toBe(true)
    expect(canWriteComments('client')).toBe(true)
    expect(canWriteComments('observer')).toBe(false)
  })
})

describe('роль автора комментария', () => {
  test('берётся из участников проекта', () => {
    const members = [member('u1', 'manager'), member('u2', 'client_lead')]
    expect(commentRoleLabel(comment(), members)).toBe('Руководитель заказчика')
    expect(commentRoleLabel(comment({ authorId: 'u1' }), members)).toBe('РП ОРДИКС')
  })

  test('вне списка участников — «ОРДИКС» (глобальная команда без роли в проекте)', () => {
    expect(commentRoleLabel(comment({ authorId: 'u9' }), [])).toBe('ОРДИКС')
  })
})

describe('карточка комментария', () => {
  test('показывает автора, роль, текст и время', () => {
    const markup = renderToStaticMarkup(
      createElement(CommentCard, { comment: comment(), roleLabel: 'Аналитик' }),
    )
    expect(markup).toContain('Пётр Смирнов')
    expect(markup).toContain('Аналитик')
    expect(markup).toContain('Посмотрите фото стеллажа')
    expect(markup).toContain('data-comment-author="petr@demo.ordiks.ru"')
    expect(markup).not.toContain('ждёт ответа')
  })

  test('needsAnswer рисует чип «ждёт ответа»', () => {
    const markup = renderToStaticMarkup(
      createElement(CommentCard, {
        comment: comment({ needsAnswer: true }),
        roleLabel: 'Наблюдатель',
      }),
    )
    expect(markup).toContain('ждёт ответа')
  })

  test('имя подставляется из email, если displayName нет', () => {
    const markup = renderToStaticMarkup(
      createElement(CommentCard, {
        comment: comment({ authorName: null }),
        roleLabel: 'РП ОРДИКС',
      }),
    )
    expect(markup).toContain('petr')
  })
})
