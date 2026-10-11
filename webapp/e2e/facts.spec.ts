import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, openSection, pickOption, shot, uniqueSuffix } from './demo-helpers'

const PHOTO_FACT_TITLE = 'Журнал смены, цех плит'

test.describe('Факты', () => {
  test('создание заметки-факта → карточка в сетке', async ({ page }) => {
    const title = `E2E Заметка ${uniqueSuffix()}`

    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'facts')

    await page.getByTestId('fact-create-open').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Новый факт')

    await dialog.getByTestId('fact-title').fill(title)
    await dialog.locator('#fact-description').fill('Заметка, созданная E2E-тестом.')
    // Тип «Заметка» — третий селект в модалке (Тип / Домен / Цех).
    await pickOption(dialog, dialog.locator('[data-slot="select-trigger"]').nth(0), 'Заметка')

    await dialog.getByTestId('fact-save').click()

    const card = page.locator(`[data-fact-title="${title}"]`)
    await expect(card).toBeVisible()

    await shot(page, '12-facts-grid')
  })

  test('клик по фото-факту открывает карточку, клик по фото — лайтбокс', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'facts')

    await page.locator(`[data-fact-title="${PHOTO_FACT_TITLE}"]`).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('[data-slot="dialog-title"]')).toHaveText(PHOTO_FACT_TITLE)

    // Фото загружается по подписанной ссылке — ждём img внутри модалки.
    const photo = dialog.locator('img')
    await expect(photo).toBeVisible()

    await photo.click()

    // Лайтбокс: фиксированный оверлей с увеличенным изображением.
    const lightbox = page.locator('div.fixed.inset-0 img')
    await expect(lightbox).toBeVisible()

    await shot(page, '13-fact-lightbox')

    // Клик по оверлею закрывает лайтбокс.
    await page.locator('div.fixed.inset-0').click({ position: { x: 10, y: 10 } })
    await expect(lightbox).toBeHidden()
  })
})
