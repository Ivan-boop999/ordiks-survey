import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, shot } from './demo-helpers'

test.describe('Дашборд', () => {
  test('KPI-карточки и hero с названием проекта', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)

    await expect(page.getByTestId('dashboard-hero')).toBeVisible()
    await expect(page.getByTestId('dashboard-project-name')).toHaveText('ЖБИ-завод, Уфа')

    const kpis = page.getByTestId('dashboard-kpis')
    await expect(kpis).toBeVisible()
    // Ключевые KPI: покрытие, интервью, находки, запросы (+ веха).
    expect(await kpis.locator(':scope > *').count()).toBeGreaterThanOrEqual(4)

    await expect(page.getByTestId('dashboard-domain-coverage')).toBeVisible()

    await shot(page, '03-dashboard-kpis')
  })

  test('блок «Ждём от заказчика» со списком запросов и переходом в раздел', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)

    await expect(page.getByText('Ждём от заказчика', { exact: true })).toBeVisible()
    const waiting = page.getByTestId('dashboard-waiting-list')
    await expect(waiting).toBeVisible()
    // В демо-сиде есть открытые (в т.ч. просроченные) запросы.
    expect(await waiting.locator(':scope > *').count()).toBeGreaterThan(0)

    await shot(page, '04-dashboard-waiting')

    await page.getByRole('link', { name: /Все запросы/ }).click()
    await expect(page).toHaveURL(/\/requests$/)
    await expect(page.getByTestId('request-create-open')).toBeVisible()
  })
})
