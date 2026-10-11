import { describe, expect, test } from 'bun:test'

import { reportApprovalCards } from '../src/features/survey/dashboard-model'
import {
  COMMUNICATION_KIND_META,
  DECISION_STATUS_META,
  QUICK_WIN_STATUS_META,
  REGISTRY_FIELD_TYPE_META,
  SURVEY_SECTIONS,
  isSectionAllowed,
  sectionPath,
} from '../src/features/survey/model'
import { REPORT_PRINT_CSS } from '../src/features/survey/report-print'

describe('словари второй волны аналитики', () => {
  test('статусы решений: действует/заменено', () => {
    expect(Object.keys(DECISION_STATUS_META).sort()).toEqual(['active', 'superseded'])
    expect(DECISION_STATUS_META.active.label).toBe('Действует')
    expect(DECISION_STATUS_META.superseded.label).toBe('Заменено')
  })

  test('типы коммуникаций: встреча/звонок/письмо', () => {
    expect(Object.keys(COMMUNICATION_KIND_META).sort()).toEqual(['call', 'email', 'meeting'])
    expect(COMMUNICATION_KIND_META.meeting.label).toBe('Встреча')
  })

  test('статусы quick wins: предложено/принято/сделано', () => {
    expect(Object.keys(QUICK_WIN_STATUS_META).sort()).toEqual(['accepted', 'done', 'suggested'])
    expect(QUICK_WIN_STATUS_META.done.label).toBe('Сделано')
  })

  test('типы полей конструктора реестров покрывают контракт', () => {
    expect(Object.keys(REGISTRY_FIELD_TYPE_META).sort()).toEqual([
      'date',
      'formula',
      'number',
      'select',
      'text',
    ])
  })
})

describe('раздел «Свои реестры»', () => {
  test('есть в списке разделов и адресуемся как /survey/p/:id/registries', () => {
    expect(SURVEY_SECTIONS).toContain('registries')
    expect(sectionPath('p1', 'registries')).toBe('/survey/p/p1/registries')
  })

  test('командный раздел: клиент и наблюдатель перенаправляются', () => {
    expect(isSectionAllowed('team', 'registries')).toBe(true)
    expect(isSectionAllowed('client', 'registries')).toBe(false)
    expect(isSectionAllowed('observer', 'registries')).toBe(false)
  })
})

describe('KPI «Согласование отчёта» на дашборде', () => {
  const readiness = { sections: 8, agreed: 5, withIssues: 2, pending: [] }

  test('команда видит «N из M разделов» с замечаниями в подсказке', () => {
    const cards = reportApprovalCards('team', readiness)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      key: 'report',
      label: 'Согласование отчёта',
      value: '5 из 8',
      tone: 'warn',
    })
    expect(cards[0].hint).toContain('с замечаниями: 2')
    expect(cards[0].hint).toContain('ждём виз: 3')
  })

  test('клиенту и наблюдателю карточка не показывается', () => {
    expect(reportApprovalCards('client', readiness)).toEqual([])
    expect(reportApprovalCards('observer', readiness)).toEqual([])
  })

  test('без отчёта или с пустым отчётом карточки нет', () => {
    expect(reportApprovalCards('team', null)).toEqual([])
    expect(reportApprovalCards('team', { ...readiness, sections: 0 })).toEqual([])
  })

  test('полностью согласованный отчёт — без warn-тона', () => {
    const [card] = reportApprovalCards('team', { sections: 4, agreed: 4, withIssues: 0, pending: [] })
    expect(card.tone).toBeUndefined()
  })
})

describe('печать реестров', () => {
  test('print-CSS рисует таблицы с рамками только внутри print-root', () => {
    expect(REPORT_PRINT_CSS).toContain('.report-print-root table { width: 100%; border-collapse: collapse;')
    expect(REPORT_PRINT_CSS).toContain('.report-print-root th, .report-print-root td { border: 1px solid #d4d4d8;')
    // Табличные правила живут внутри @media print — на экран не влияют.
    expect(REPORT_PRINT_CSS.indexOf('.report-print-root table')).toBeGreaterThan(
      REPORT_PRINT_CSS.indexOf('@media print'),
    )
  })
})
