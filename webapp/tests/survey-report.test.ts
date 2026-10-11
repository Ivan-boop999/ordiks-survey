import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReportSectionDto, SectionApprovalDto } from '@ordiks-survey/contracts'

import {
  approvalPayload,
  approvalSummary,
  buildReportWordHtml,
  canApproveSections,
  hasInsertFragment,
  moveSectionIds,
  readinessSummary,
  tableHtml,
  wrapLinesList,
  wrapSelection,
} from '../src/features/survey/report-model'
import { REPORT_PRINT_CSS, ReportTitlePage } from '../src/features/survey/report-print'

function approval(
  overrides: Partial<SectionApprovalDto> & { userId: string; decision: 'approved' | 'changes' },
): SectionApprovalDto {
  return {
    email: 'user@example.com',
    displayName: 'Пётр Заказчик',
    comment: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function section(overrides: Partial<ReportSectionDto> & { id: string }): ReportSectionDto {
  return {
    projectId: 'proj-1',
    title: 'Раздел',
    body: '',
    sortOrder: 0,
    approvals: [],
    ...overrides,
  }
}

describe('визы', () => {
  test('сводка «согласовано N из M»: замечание бьёт согласование, пусто — не в счёт', () => {
    const sections = [
      section({ id: 's1', approvals: [approval({ userId: 'u1', decision: 'approved' })] }),
      section({
        id: 's2',
        approvals: [
          approval({ userId: 'u1', decision: 'approved' }),
          approval({ userId: 'u2', decision: 'changes', comment: 'Переделать таблицу' }),
        ],
      }),
      section({ id: 's3' }),
    ]
    expect(approvalSummary(sections)).toEqual({ sections: 3, agreed: 1, withIssues: 1 })
  })

  test('повторная виза того же пользователя не задваивает решение', () => {
    const sections = [
      section({
        id: 's1',
        approvals: [
          approval({ userId: 'u1', decision: 'changes' }),
          approval({ userId: 'u1', decision: 'approved' }),
        ],
      }),
    ]
    expect(approvalSummary(sections)).toEqual({ sections: 1, agreed: 1, withIssues: 0 })
  })

  test('тело запроса визы: решение + обрезанный комментарий', () => {
    expect(approvalPayload('approved', '  ок  ')).toEqual({ decision: 'approved', comment: 'ок' })
    expect(approvalPayload('changes', '')).toEqual({ decision: 'changes', comment: '' })
  })

  test('кнопки виз видят только клиентские роли', () => {
    expect(canApproveSections('client')).toBe(true)
    expect(canApproveSections('team')).toBe(false)
    expect(canApproveSections('observer')).toBe(false)
  })

  test('readinessSummary формирует строку сводки из серверной готовности', () => {
    expect(
      readinessSummary({ sections: 4, agreed: 2, withIssues: 1, pending: [] }),
    ).toBe('согласовано 2 из 4')
    expect(readinessSummary(undefined)).toBe('')
  })

  test('moveSectionIds меняет соседей и не трогает границы', () => {
    const ids = ['a', 'b', 'c']
    expect(moveSectionIds(ids, 0, -1)).toBe(ids)
    expect(moveSectionIds(ids, 2, 1)).toBe(ids)
    expect(moveSectionIds(ids, 1, -1)).toEqual(['b', 'a', 'c'])
  })
})

describe('печать отчёта', () => {
  test('титул содержит проект, дату и команду с ролями', () => {
    const markup = renderToStaticMarkup(
      createElement(ReportTitlePage, {
        client: 'ООО «Ромашка»',
        dateLabel: '10 окт. 2026',
        members: [
          { name: 'Иван РП', roleLabel: 'РП ОРДИКС' },
          { name: 'Мария Аналитик', roleLabel: 'Аналитик' },
        ],
        projectName: 'Обследование продаж',
      }),
    )
    expect(markup).toContain('Обследование продаж')
    expect(markup).toContain('ООО «Ромашка»')
    expect(markup).toContain('10 окт. 2026')
    expect(markup).toContain('Иван РП · РП ОРДИКС')
    expect(markup).toContain('Мария Аналитик · Аналитик')
    expect(markup).toContain('report-print-page')
    expect(markup).toContain('Команда обследования')
  })

  test('print stylesheet: A4, скрывает всё кроме отчёта, режет по страницам', () => {
    expect(REPORT_PRINT_CSS).toContain('@page { size: A4')
    expect(REPORT_PRINT_CSS).toContain('body * { visibility: hidden; }')
    expect(REPORT_PRINT_CSS).toContain('.report-print-root, .report-print-root * { visibility: visible; }')
    expect(REPORT_PRINT_CSS).toContain('page-break-after: always')
    expect(REPORT_PRINT_CSS).toContain('.report-print-hidden { display: none !important; }')
    // Таблицы автовставок читаются и на экране, и на бумаге.
    expect(REPORT_PRINT_CSS).toContain('.report-body table')
  })
})

describe('панель форматирования и вставки (улучшения 2026-10)', () => {
  test('wrapSelection оборачивает выделение и возвращает новый диапазон', () => {
    // «вопрос и ответ»: выделение 9..14 — слово «ответ».
    const result = wrapSelection('вопрос и ответ', 9, 14, '<strong>', '</strong>')
    expect(result.text).toBe('вопрос и <strong>ответ</strong>')
    expect(result.selectionStart).toBe(9 + '<strong>'.length)
    expect(result.selectionEnd).toBe(result.selectionStart + 'ответ'.length)
  })

  test('wrapLinesList превращает выделенные строки в li (расширяя до строк целиком)', () => {
    const text = 'до\nраз\nдва\nпосле'
    const result = wrapLinesList(text, 3, 10, 'ul')
    expect(result.text).toBe('до\n<ul><li>раз</li><li>два</li></ul>\nпосле')
  })

  test('tableHtml ограничивает размеры и рисует шапку', () => {
    const html = tableHtml(2, 3)
    expect(html).toContain('<th>Колонка 1</th>')
    expect((html.match(/<tr>/g) ?? []).length).toBe(3) // шапка + 2 строки
    expect(tableHtml(99, 99)).not.toContain('Колонка 11')
  })

  test('hasInsertFragment находит уже вставленную таблицу по заголовку сервера', () => {
    const body =
      '<h3>Проблемы: Производство</h3><table><tr><th>Проблема</th></tr></table>'
    expect(hasInsertFragment(body, 'findings', { domainName: 'Производство' })).toBe(true)
    expect(hasInsertFragment(body, 'findings', { domainName: 'Качество' })).toBe(false)
    expect(hasInsertFragment('', 'risks', {})).toBe(false)
    expect(hasInsertFragment('<h3>Реестр рисков</h3>', 'risks', {})).toBe(true)
  })

  test('buildReportWordHtml собирает титул и разделы для HTML-as-doc', () => {
    const html = buildReportWordHtml(
      {
        projectName: 'Обследование «Завод»',
        client: 'ООО «Завод»',
        dateLabel: '11 окт. 2026',
        members: [{ name: 'Иван РП', roleLabel: 'РП ОРДИКС' }],
      },
      [
        { title: 'Цель', body: '<p>текст</p>' },
        { title: 'Пустой', body: '' },
      ],
    )
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('Обследование «Завод»')
    expect(html).toContain('<li>Иван РП — РП ОРДИКС</li>')
    expect(html).toContain('<h2>1. Цель</h2><p>текст</p>')
    expect(html).toContain('<h2>2. Пустой</h2><p>—</p>')
  })
})
