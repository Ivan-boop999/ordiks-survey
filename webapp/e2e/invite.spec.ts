import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, openSection, shot, uniqueSuffix } from './demo-helpers'

test.describe('Приглашение', () => {
  test('/invite?code=… → создание аккаунта → редирект в /survey', async ({ page, browser }) => {
    // Команда ОРДИКС создаёт приглашение в настройках проекта (вкладка «Приглашения»).
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'settings')

    await page.getByRole('tab', { name: 'Приглашения' }).click()
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

    // Переход по ссылке приглашения — в отдельном чистом контексте браузера
    // (выход через меню сейчас подвешивает страницу /survey/* — продукт-баг, см. отчёт).
    const inviteContext = await browser.newContext()
    const invitePage = await inviteContext.newPage()

    // Переход по ссылке приглашения.
    await invitePage.goto(`/invite?code=${encodeURIComponent(code)}`)
    await expect(invitePage.getByTestId('invite-form')).toBeVisible()
    await expect(invitePage.getByTestId('invite-code')).toHaveValue(code)

    const email = `e2e-invite-${uniqueSuffix()}@demo.ordiks.ru`
    await invitePage.getByTestId('invite-email').fill(email)
    await invitePage.getByTestId('invite-name').fill('Инвайти E2E')
    await invitePage.getByTestId('invite-password').fill('ordiks-demo')

    await shot(invitePage, '28-invite-form')

    await invitePage.getByTestId('invite-submit').click()

    // Аккаунт создан, выполнен вход и редирект в приложение обследования.
    await expect(invitePage.getByTestId('survey-navigation')).toBeVisible()
    await expect(invitePage).toHaveURL(/\/survey/)

    await shot(invitePage, '29-invite-accepted')

    await inviteContext.close()
  })
})
