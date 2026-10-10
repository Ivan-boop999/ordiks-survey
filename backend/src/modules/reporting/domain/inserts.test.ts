import { describe, expect, test } from 'bun:test'

import { projectSettingsSchema } from '@ordiks-survey/contracts'

import { coverageTableHtml, findingsTableHtml, risksTableHtml, formatDateRu } from './inserts'

const settings = projectSettingsSchema.parse({})

describe('автовставки отчёта: HTML-таблицы из данных проекта', () => {
  test('findingsTableHtml: находки домена с именем статуса из справочника', () => {
    const html = findingsTableHtml(
      'Планирование: цех плит',
      [
        { title: 'План в 3 местах', priority: 'Критично', status: 'confirmed' },
        { title: 'Нет связи с ППР', priority: 'Высокий', status: 'escalated' },
      ],
      settings,
    )
    expect(html).toContain('<h3>Проблемы: Планирование: цех плит</h3>')
    expect(html).toContain('<th>Проблема</th><th>Приоритет</th><th>Статус</th>')
    expect(html).toContain('<td>План в 3 местах</td><td>Критично</td><td>Подтверждена</td>')
    // Незнакомый id статуса показывается как есть (кастомный справочник проекта).
    expect(html).toContain('<td>Нет связи с ППР</td><td>Высокий</td><td>escalated</td>')
  })

  test('findingsTableHtml: пустой список — пустая строка (нечего вставлять)', () => {
    expect(findingsTableHtml('Домен', [], settings)).toBe('')
  })

  test('risksTableHtml: критичность = вероятность × влияние, статусы по-русски', () => {
    const html = risksTableHtml([
      {
        title: 'Срыв данных',
        probability: 4,
        impact: 3,
        status: 'open',
        ownerName: 'Иван Заболотный',
        mitigation: 'Эскалация',
      },
      {
        title: 'Отказ формы',
        probability: 3,
        impact: 5,
        status: 'mitigated',
        ownerName: null,
        mitigation: '',
      },
    ])
    expect(html).toContain('<h3>Реестр рисков</h3>')
    expect(html).toContain('<td>Срыв данных</td><td>4</td><td>3</td><td>12</td><td>открыт</td>')
    expect(html).toContain('<td>Отказ формы</td><td>3</td><td>5</td><td>15</td><td>смягчён</td><td>—</td><td>—</td>')
  })

  test('coverageTableHtml: проценты пунктов и закрытые направления', () => {
    const html = coverageTableHtml([
      { groupName: 'Производство', items: 10, done: 7, domainsTotal: 6, domainsClosed: 2 },
      { groupName: 'Качество', items: 0, done: 0, domainsTotal: 0, domainsClosed: 0 },
    ])
    expect(html).toContain('<h3>Покрытие направлений обследования</h3>')
    expect(html).toContain('<td>Производство</td><td>70% (7/10)</td><td>2 из 6</td>')
    expect(html).toContain('<td>Качество</td><td>0% (0/0)</td><td>0 из 0</td>')
  })

  test('formatDateRu: дд.мм.гггг в UTC', () => {
    expect(formatDateRu(new Date('2026-03-01T00:00:00.000Z'))).toBe('01.03.2026')
    expect(formatDateRu(null)).toBe('—')
  })
})
