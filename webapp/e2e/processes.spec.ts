import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, openSection, shot } from './demo-helpers'

test.describe('Процессы AS-IS / TO-BE', () => {
  test('вкладки AS-IS, TO-BE и «Сравнение»; шаги процессов видны', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'processes')

    // AS-IS: цепочка шагов.
    await expect(page.getByTestId('process-tab-asis')).toBeVisible()
    const asisSteps = page.getByTestId('process-steps-asis').locator('li')
    expect(await asisSteps.count()).toBeGreaterThan(0)
    await expect(asisSteps.first()).toBeVisible()

    await shot(page, '20-processes-asis')

    // TO-BE.
    await page.getByTestId('process-tab-tobe').click()
    const tobeSteps = page.getByTestId('process-steps-tobe').locator('li')
    await expect(page.getByTestId('process-steps-tobe')).toBeVisible()
    expect(await tobeSteps.count()).toBeGreaterThan(0)

    // Сравнение сторон.
    await page.getByTestId('process-tab-compare').click()
    await expect(page.getByTestId('process-compare-table')).toBeVisible()
    await expect(page.getByTestId('process-compare-schemes')).toBeVisible()

    await shot(page, '21-processes-compare')
  })
})
