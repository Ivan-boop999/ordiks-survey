import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, logOut, openDemoProject, openSection, shot, uniqueSuffix } from './demo-helpers'

test.describe('Приглашение', () => {
  test('/invite?code=… → создание аккаунта → редирект в /survey', async ({ page }) => {
    // Команда ОРДИКС создаёт приглашение в настройках проекта.
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'settings')

    await page.getByTestId('invite-create-open').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Новое приглашение')
    await page.getByTestId('invite-create-submit').click()

    const created = page.getByTestId('invite-created')
    await expect(created).toBeVisible()
    const code = (await page.getByTestId('invite-created-code').innerText()).trim()
    expect(code).toMatch(/\S+/)

    await shot(page, '27-invite-created')

    await page.keyboard.press('Escape')
    await logOut(page)

    // Переход по ссылке приглашения.
    await page.goto(`/invite?code=${encodeURIComponent(code)}`)
    await expect(page.getByTestId('invite-form')).toBeVisible()
    await expect(page.getByTestId('invite-code')).toHaveValue(code)

    const email = `e2e-invite-${uniqueSuffix()}@demo.ordiks.ru`
    await page.getByTestId('invite-email').fill(email)
    await page.getByTestId('invite-name').fill('Инвайти E2E')
    await page.getByTestId('invite-password').fill('ordiks-demo')

    await shot(page, '28-invite-form')

    await page.getByTestId('invite-submit').click()

    // Аккаунт создан, выполнен вход и редирект в приложение обследования.
    await expect(page.getByTestId('survey-navigation')).toBeVisible()
    await expect(page).toHaveURL(/\/survey/)

    await shot(page, '29-invite-accepted')
  })
})
