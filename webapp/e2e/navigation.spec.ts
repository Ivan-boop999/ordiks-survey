import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, shot } from './demo-helpers'

/**
 * Каждый раздел открывается кликом по сайдбару и показывает свой якорь содержимого.
 * Порядок — как в сайдбаре; «Настройки» в конце, чтобы вернуться в рабочий раздел
 * следующим тестам не пришлось.
 */
const SECTIONS: ReadonlyArray<{ id: string; anchor: string }> = [
  { id: 'dashboard', anchor: 'dashboard-kpis' },
  // В режиме чтения у паспорта нет поля с названием — кнопка «Редактировать».
  { id: 'passport', anchor: 'passport-edit-open' },
  { id: 'stages', anchor: 'stages-list' },
  { id: 'plan', anchor: 'plan-kanban' },
  { id: 'domains', anchor: 'domains-tree' },
  { id: 'interviews', anchor: 'interview-create-open' },
  { id: 'guides', anchor: 'guide-create-open' },
  { id: 'facts', anchor: 'fact-create-open' },
  { id: 'requests', anchor: 'request-create-open' },
  { id: 'findings', anchor: 'findings-table' },
  { id: 'processes', anchor: 'process-tab-asis' },
  { id: 'analytics', anchor: 'analytics-tab-risks' },
  { id: 'report', anchor: 'report-print-button' },
  { id: 'settings', anchor: 'settings-members' },
]

test.describe('Навигация', () => {
  test('вход ivan → /survey → клик по каждому разделу сайдбара открывает его содержимое', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)

    // Сайдбар с разделами обследования.
    const navigation = page.getByTestId('survey-navigation')
    await expect(navigation).toBeVisible()

    for (const { id, anchor } of SECTIONS) {
      await page.getByTestId(`survey-nav-${id}`).click()
      await expect(page.getByTestId(anchor).first()).toBeVisible({
        timeout: 20_000,
      })
      // URL отражает открытый раздел.
      await expect(page).toHaveURL(new RegExp(`/${id}$`))
    }

    // Ссылка «Проекты» ведёт к списку проектов.
    await page.getByTestId('survey-nav-projects').click()
    await expect(page.getByTestId('project-card').first()).toBeVisible()
    await expect(page).toHaveURL(/\/survey\/projects$/)

    await shot(page, '30-navigation-sections')
  })
})
