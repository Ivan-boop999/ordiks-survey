import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, shot } from './demo-helpers'

test.describe('Роли', () => {
  test('rustem (директор заказчика) не видит кнопок создания и командных разделов', async ({ page }) => {
    await logIn(page, DEMO_USERS.clientLead)
    await openDemoProject(page)

    // Клиентский контур: без «Гайдов» и «Настроек».
    await expect(page.getByTestId('survey-nav-guides')).toHaveCount(0)
    await expect(page.getByTestId('survey-nav-settings')).toHaveCount(0)
    // Основные разделы доступны.
    for (const section of ['dashboard', 'plan', 'domains', 'facts', 'requests', 'findings', 'report']) {
      await expect(page.getByTestId(`survey-nav-${section}`)).toBeVisible()
    }

    // Дашборд клиента: «Ждём от вас», а не «Ждём от заказчика».
    await expect(page.getByText('Ждём от вас', { exact: true })).toBeVisible()

    // В рабочих разделах нет кнопок создания.
    for (const [section, testId] of [
      ['facts', 'fact-create-open'],
      ['findings', 'finding-create-open'],
      ['interviews', 'interview-create-open'],
      ['requests', 'request-create-open'],
      ['plan', 'task-create-open'],
    ] as const) {
      await page.getByTestId(`survey-nav-${section}`).click()
      await expect(page.getByTestId(testId)).toHaveCount(0)
    }

    await shot(page, '25-roles-client-no-create')
  })

  test('sergey (наблюдатель) видит разделы read-only: без создания, виз и действий', async ({ page }) => {
    await logIn(page, DEMO_USERS.observer)
    await openDemoProject(page)

    // Навигация без командных разделов.
    await expect(page.getByTestId('survey-nav-guides')).toHaveCount(0)
    await expect(page.getByTestId('survey-nav-settings')).toHaveCount(0)

    // Находки: нет ни создания, ни чекбоксов bulk-выбора.
    await page.getByTestId('survey-nav-findings').click()
    await expect(page.getByTestId('findings-table')).toBeVisible()
    await expect(page.getByTestId('finding-create-open')).toHaveCount(0)
    await expect(page.getByLabel('Выбрать все найденные')).toHaveCount(0)

    // Запросы: нет ни создания, ни «В работу»/«Получено».
    await page.getByTestId('survey-nav-requests').click()
    await expect(page.getByTestId('request-row').first()).toBeVisible()
    await expect(page.getByTestId('request-create-open')).toHaveCount(0)
    await expect(page.locator('[aria-label^="Взять «"]')).toHaveCount(0)
    await expect(page.locator('[aria-label^="Отметить «"]')).toHaveCount(0)

    // План: канбан видно, но без кнопок создания и переноса.
    await page.getByTestId('survey-nav-plan').click()
    await expect(page.getByTestId('plan-kanban')).toBeVisible()
    await expect(page.getByTestId('task-create-open')).toHaveCount(0)
    await expect(page.locator('[aria-label^="Переместить «"]')).toHaveCount(0)

    // Отчёт: печать доступна, добавление раздела — нет.
    await page.getByTestId('survey-nav-report').click()
    await expect(page.getByTestId('report-print-button')).toBeVisible()
    await expect(page.getByTestId('section-create-open')).toHaveCount(0)

    await shot(page, '26-roles-observer-readonly')
  })
})
