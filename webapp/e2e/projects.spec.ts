import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, shot, uniqueSuffix } from './demo-helpers'

test.describe('Проекты', () => {
  test('создание проекта через модалку → карточка в списке', async ({ page }) => {
    const name = `E2E Проект ${uniqueSuffix()}`

    await logIn(page, DEMO_USERS.owner)
    await page.goto('/survey/projects')

    // Ждём загрузки списка, иначе cardsBefore посчитается по пустой странице.
    await page.getByTestId('project-card').first().waitFor()
    const cardsBefore = await page.getByTestId('project-card').count()

    await page.getByTestId('project-create-open').click()
    await expect(page.getByRole('dialog')).toContainText('Новый проект')

    await page.getByTestId('project-name').fill(name)
    await page.locator('#project-client').fill('ООО «E2E Завод»')
    await page.locator('#project-city').fill('Казань')
    await page.locator('#project-shops').fill('Цех E2E\nОтдел E2E')

    await shot(page, '05-project-modal')

    await page.getByTestId('project-create-submit').click()

    const newCard = page.getByTestId('project-card').filter({ hasText: name })
    await expect(newCard).toBeVisible()
    expect(await page.getByTestId('project-card').count()).toBe(cardsBefore + 1)

    await shot(page, '06-project-created')
  })
})
