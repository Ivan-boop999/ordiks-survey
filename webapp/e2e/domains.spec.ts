import { test, expect, type Locator } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, openSection, shot } from './demo-helpers'

test.describe('Домены', () => {
  /** Первая строка домена с непройденным чек-листом (done/total в подписи строки). */
  async function domainWithOpenChecklist(page: import('@playwright/test').Page): Promise<Locator> {
    const rows = page.locator('[data-testid^="domain-row-"]')
    const count = await rows.count()
    for (let index = 0; index < count; index += 1) {
      const text = await rows.nth(index).innerText()
      const match = text.match(/(\d+)\/(\d+) пунктов/)
      if (match && Number(match[1]) < Number(match[2])) return rows.nth(index)
    }
    throw new Error('Не нашёлся домен с непройденным чек-листом')
  }

  test('модалка домена: клик по пункту чек-листа обновляет прогресс', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'domains', { testId: 'domains-tree' })

    const row = await domainWithOpenChecklist(page)
    await row.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('checklist-domain-name')).toBeVisible()

    const description = dialog.locator('[data-slot="dialog-description"]')
    const before = await description.innerText()

    // Локатор по :not(:checked) переселектируется на соседний пункт сразу после
    // клика — берём стабильный aria-label первого непроверенного пункта.
    const firstUnchecked = dialog.getByTestId('checklist-items').locator('input[type="checkbox"]:not(:checked)').first()
    const itemLabel = ((await firstUnchecked.getAttribute('aria-label')) ?? '').trim()
    expect(itemLabel.length).toBeGreaterThan(0)
    const item = dialog.getByLabel(itemLabel, { exact: true })

    await item.click()
    await expect(item).toBeChecked()

    // Прогресс в описании модалки: «X из Y пунктов выполнено» — X вырос на 1.
    const match = before.match(/(\d+) из (\d+) пунктов/)
    expect(match).not.toBeNull()
    const expectedAfter = `${Number(match![1]) + 1} из ${match![2]} пунктов`
    await expect(description).toContainText(expectedAfter)

    await shot(page, '07-domain-checklist')

    // Возвращаем состояние, чтобы не раскачивать демо-данные.
    await item.click()
    await expect(item).not.toBeChecked()
    await expect(description).toContainText(before.match(/\d+ из \d+ пунктов/)![0])
  })
})
