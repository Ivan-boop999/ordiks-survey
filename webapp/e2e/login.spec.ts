import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, shot } from './demo-helpers'

test.describe('Вход', () => {
  test('демо-кнопка «Владелец» подставляет креды, логин ведёт в /survey с сайдбаром', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByTestId('demo-access-block')).toBeVisible()
    await expect(page.getByTestId('demo-login-owner')).toBeVisible()

    await page.getByTestId('demo-login-owner').click()
    await expect(page.getByTestId('login-email')).toHaveValue(DEMO_USERS.owner)
    await expect(page.getByTestId('login-password')).toHaveValue('ordiks-demo')

    await page.getByTestId('login-submit').click()

    await expect(page).toHaveURL(/\/survey/)
    await expect(page.getByTestId('survey-navigation')).toBeVisible()
    await expect(page.getByTestId('dashboard-project-name')).toBeVisible()

    await shot(page, '01-login-demo-button')
  })

  test('вход по форме (РП Анна) → редирект в /survey, почта в меню аккаунта', async ({ page }) => {
    await logIn(page, DEMO_USERS.manager)

    await expect(page).toHaveURL(/\/survey\/p\/.+\/dashboard/)
    await expect(page.getByTestId('dashboard-project-name')).toBeVisible()

    await page.getByTestId('account-menu').click()
    await expect(page.getByTestId('current-user-email')).toHaveText(DEMO_USERS.manager)

    await shot(page, '02-login-form')
  })

  test('неверный пароль показывает ошибку и не пускает в /survey', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-email').fill(DEMO_USERS.owner)
    await page.getByTestId('login-password').fill('wrong-password')
    await page.getByTestId('login-submit').click()

    await expect(page.getByTestId('login-form')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })
})
