import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, openSection, shot, uniqueSuffix } from './demo-helpers'

test.describe('Отчёт', () => {
  test('разделы отчёта с телом и визами заказчика', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'report')

    const sections = page.locator('[data-section-title]')
    // Демо-сид собирает отчёт из 6 разделов.
    expect(await sections.count()).toBeGreaterThanOrEqual(5)

    const first = sections.first()
    await expect(first.getByTestId('section-body')).toBeVisible()

    await shot(page, '22-report-sections')
  })

  test('автовставка «Покрытие доменов» наполняет тело раздела', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'report')

    const first = page.locator('[data-section-title]').first()
    await first.getByTestId('insert-coverage').click()

    await expect(first.getByTestId('section-body')).toContainText('Покрытие направлений обследования')

    await shot(page, '23-report-coverage-insert')
  })

  test('печать отчёта: print-CSS и выгрузка PDF', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'report')

    // Print-стили подключены на странице (report-print-root + A4).
    await expect(page.locator('.report-print-root')).toBeVisible()

    // Кнопка «Печать/PDF» вызывает window.print() — в headless это безопасно.
    await page.getByTestId('report-print-button').click()

    // PDF-выгрузка того, что уходит в печать.
    await page.pdf({
      path: 'e2e/.artifacts/demo-screens/24-report-print.pdf',
      format: 'A4',
      printBackground: true,
    })
  })

  test('создание нового раздела отчёта', async ({ page }) => {
    const title = `E2E Раздел ${uniqueSuffix()}`

    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'report')

    const before = await page.locator('[data-section-title]').count()

    await page.getByTestId('section-create-open').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Новый раздел')
    await dialog.getByTestId('section-title').fill(title)
    await dialog.locator('#section-body-input').fill('<p>Текст раздела из E2E-теста.</p>')
    await dialog.getByTestId('section-save').click()

    await expect(page.locator(`[data-section-title="${title}"]`)).toBeVisible()
    expect(await page.locator('[data-section-title]').count()).toBe(before + 1)
  })
})
