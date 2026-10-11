import { test, expect, type Page } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, openSection, pickOption, shot, uniqueSuffix } from './demo-helpers'

const GUIDE_NAME = 'Опросник: планирование производства'
const FIRST_QUESTION = 'Как заказ клиента превращается в план цеха? Кто участвует?'

async function createInterview(page: Page, respondent: string): Promise<void> {
  await page.getByTestId('interview-create-open').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Новое интервью')
  await dialog.locator('#interview-when').fill('2026-11-05T10:00')
  await dialog.getByTestId('interview-respondent').fill(respondent)
  await pickOption(dialog, dialog.getByText('— без гайда —'), GUIDE_NAME)
  await dialog.getByTestId('interview-save').click()
  await expect(page.locator(`[data-interview-respondent="${respondent}"]`)).toBeVisible()
}

test.describe('Интервью', () => {
  test('создание интервью с гайдом → строка в расписании', async ({ page }) => {
    const respondent = `E2E Респондент ${uniqueSuffix()}`

    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'interviews')

    await page.getByTestId('interview-create-open').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Новое интервью')

    await dialog.locator('#interview-when').fill('2026-11-05T10:00')
    await dialog.getByTestId('interview-respondent').fill(respondent)
    await pickOption(dialog, dialog.getByText('— без гайда —'), GUIDE_NAME)

    await shot(page, '10-interview-modal')

    await dialog.getByTestId('interview-save').click()
    await expect(page.locator(`[data-interview-respondent="${respondent}"]`)).toBeVisible()
  })

  test('карточка интервью: конспект и ответ на вопрос гайда сохраняются', async ({ page }) => {
    const respondent = `E2E Респондент ${uniqueSuffix()}`
    const notes = `Конспект E2E ${uniqueSuffix()}`

    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'interviews')
    await createInterview(page, respondent)

    // Открываем карточку интервью.
    await page.locator(`[data-interview-respondent="${respondent}"]`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('[data-slot="dialog-title"]')).toHaveText(respondent)
    await expect(dialog.getByText(`Анкета: ${GUIDE_NAME}`)).toBeVisible()

    // Конспект.
    await dialog.locator('#interview-notes').fill(notes)
    await dialog.getByRole('button', { name: 'Сохранить конспект' }).click()
    await expect(page.getByText('Конспект сохранён')).toBeVisible()

    // Ответ на первый вопрос гайда (текстовый).
    const questionField = dialog.locator('div[data-slot="field"]', { hasText: FIRST_QUESTION })
    await questionField.locator('textarea').fill('Заказ попадает в Excel ПДО — ответ из E2E-теста.')
    await dialog.getByTestId('interview-answers-save').click()
    await expect(page.getByText('Сохранено ответов: 1')).toBeVisible()

    await shot(page, '11-interview-card')

    // Ответ сохранён: переоткрываем карточку и проверяем значение.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.locator(`[data-interview-respondent="${respondent}"]`).click()
    await expect(
      page.getByRole('dialog').locator('div[data-slot="field"]', { hasText: FIRST_QUESTION }).locator('textarea'),
    ).toHaveValue('Заказ попадает в Excel ПДО — ответ из E2E-теста.')
  })
})
