import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, pickOption, shot } from './demo-helpers'

/** Вычисленный фон страницы (на html прокидывается фон body через Tailwind). */
function pageBackground(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor)
}

test.describe('Тёмная тема', () => {
  test('переключение в настройках вида меняет класс html и фон приложения', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)

    //.Headless Chromium без prefers-color-scheme: dark → стартуем в светлой теме.
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await pageBackground(page)

    // Настройки вида: меню аккаунта → /app/settings.
    await page.getByTestId('account-menu').click()
    await page.getByRole('menuitem', { name: 'Настройки вида' }).click()
    await expect(page).toHaveURL(/\/app\/settings$/);

    // Селектор темы: system / light / dark.
    const lightBefore = await pageBackground(page)
    await pickOption(page, page.locator('#appearance-theme'), 'Dark')

    // next-themes вешает класс dark на <html> и применяет палитру немедленно.
    await expect(page.locator('html')).toHaveClass(/dark/)
    const darkBackground = await pageBackground(page)
    expect(darkBackground).not.toBe(lightBefore)

    await shot(page, '31-theme-dark')

    // Тема действует и в приложении обследования, а не только в настройках.
    await page.goto('/survey')
    await expect(page.getByTestId('dashboard-kpis')).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByTestId('survey-navigation')).toBeVisible()
    expect(await pageBackground(page)).toBe(darkBackground)

    await shot(page, '32-theme-dark-survey')

    // Возврат к светлой теме: класс снят, фон вернулся.
    await page.getByTestId('account-menu').click()
    await page.getByRole('menuitem', { name: 'Настройки вида' }).click()
    await expect(page).toHaveURL(/\/app\/settings$/)
    await pickOption(page, page.locator('#appearance-theme'), 'Light')

    await expect(page.locator('html')).not.toHaveClass(/dark/)
    expect(await pageBackground(page)).toBe(lightBefore)
  })
})
