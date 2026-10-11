import { test, expect, type Page } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, openSection, pickOption, shot, uniqueSuffix } from './demo-helpers'

async function createFinding(page: Page, title: string): Promise<void> {
  await page.getByTestId('finding-create-open').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Новая находка')
  await dialog.getByTestId('finding-title').fill(title)
  await dialog.getByTestId('finding-save').click()
  await expect(page.locator(`[data-finding-title="${title}"]`)).toBeVisible()
}

test.describe('Находки', () => {
  test('создание находки → строка в реестре', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'findings')

    await createFinding(page, `E2E Находка ${uniqueSuffix()}`)

    await expect(page.getByTestId('findings-table')).toBeVisible()
    await shot(page, '17-findings-table')
  })

  test('фильтр по приоритету «Критично»', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'findings')

    const rows = page.locator('[data-finding-title]')
    const total = await rows.count()

    await pickOption(page, page.getByText('Любой приоритет'), 'Критично')

    const filtered = await rows.count()
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThan(total)

    for (const row of await rows.all()) {
      await expect(row.getByText('Критично', { exact: true })).toBeVisible()
    }

    await shot(page, '18-findings-priority-filter')
  })

  test('bulk-выбор находок и смена статуса', async ({ page }) => {
    const first = `E2E Bulk A ${uniqueSuffix()}`
    const second = `E2E Bulk B ${uniqueSuffix()}`

    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'findings')

    await createFinding(page, first)
    await createFinding(page, second)

    // Выбираем обе галочками.
    await page.getByLabel(`Выбрать «${first}»`, { exact: true }).click()
    await page.getByLabel(`Выбрать «${second}»`, { exact: true }).click()

    const bulk = page.getByTestId('finding-bulk')
    await expect(bulk).toBeVisible()
    await expect(bulk.getByText('Выбрано: 2')).toBeVisible()

    await shot(page, '19-findings-bulk')

    // Меняем статус на «Подтверждена».
    await bulk.getByRole('button', { name: '→ Подтверждена' }).click()
    await expect(page.getByText('Статус обновлён: 2')).toBeVisible()

    await expect(
      page.locator(`[data-finding-title="${first}"]`).getByText('Подтверждена', { exact: true }),
    ).toBeVisible()
    await expect(
      page.locator(`[data-finding-title="${second}"]`).getByText('Подтверждена', { exact: true }),
    ).toBeVisible()
  })
})
