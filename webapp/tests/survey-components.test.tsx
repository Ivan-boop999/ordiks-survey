import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  KpiCard,
  ProgressBar,
  SectionCard,
  StatusChip,
  SurveyEmptyState,
} from '../src/components/survey'

// Рендер-тесты базовых компонентов обследования: статическая разметка без DOM-библиотеки
// (в репозитории нет Testing Library — паттерн шаблона: чистые проверки без браузера).

test('StatusChip renders the palette color and outline variant', () => {
  const red = renderToStaticMarkup(createElement(StatusChip, { color: 'red' }, 'Просрочен'))
  expect(red).toContain('Просрочен')
  expect(red).toContain('rounded-full')

  const outline = renderToStaticMarkup(createElement(StatusChip, { outline: true }, 'Без домена'))
  expect(outline).toContain('Без домена')
  expect(outline).toContain('bg-transparent')
})

test('ProgressBar reports an accessible value and a zero track for empty checklists', () => {
  const markup = renderToStaticMarkup(
    createElement(ProgressBar, { done: 2, max: 4, label: 'Покрытие' }),
  )
  expect(markup).toContain('role="progressbar"')
  expect(markup).toContain('aria-valuenow="2"')
  expect(markup).toContain('aria-valuemax="4"')
  expect(markup).toContain('width:50%')

  const empty = renderToStaticMarkup(createElement(ProgressBar, { done: 0, max: 0 }))
  expect(empty).toContain('width:0%')
})

test('KpiCard shows label, value, hint, and icon plate', () => {
  const markup = renderToStaticMarkup(
    createElement(
      KpiCard,
      { label: 'Открытые находки', value: '3', hint: 'всего: 7', tone: 'warn', color: 'amber' },
      null,
    ),
  )
  expect(markup).toContain('Открытые находки')
  expect(markup).toContain('3')
  expect(markup).toContain('всего: 7')
  expect(markup).toContain('text-amber-600')
})

test('SectionCard renders an optional header and keeps the body', () => {
  const markup = renderToStaticMarkup(
    createElement(
      SectionCard,
      { title: 'Ждём от заказчика', description: 'открытые запросы' },
      createElement('p', null, 'контент'),
    ),
  )
  expect(markup).toContain('Ждём от заказчика')
  expect(markup).toContain('открытые запросы')
  expect(markup).toContain('контент')

  const headerless = renderToStaticMarkup(
    createElement(SectionCard, null, createElement('p', null, 'только тело')),
  )
  expect(headerless).not.toContain('<header')
  expect(headerless).toContain('только тело')
})

test('SurveyEmptyState shows title, description, and action', () => {
  const markup = renderToStaticMarkup(
    createElement(SurveyEmptyState, {
      title: 'Проектов пока нет',
      description: 'Попросите приглашение',
      action: createElement('button', { type: 'button' }, 'Создать'),
    }),
  )
  expect(markup).toContain('Проектов пока нет')
  expect(markup).toContain('Попросите приглашение')
  expect(markup).toContain('Создать')
  expect(markup).toContain('border-dashed')
})
