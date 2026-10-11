import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, openSection, pickOption, shot } from './demo-helpers'

test.describe('План (канбан)', () => {
  test('четыре колонки канбана с карточками задач', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'plan', { testId: 'plan-kanban' })

    for (const status of ['todo', 'doing', 'done', 'cancelled']) {
      await expect(page.getByTestId(`kanban-column-${status}`)).toBeVisible()
    }
    const cards = page.locator('[data-testid^="kanban-card-"]')
    expect(await cards.count()).toBeGreaterThan(0)

    await shot(page, '08-plan-kanban')
  })

  test('перенос задачи кнопками «вправо/влево» между колонками', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'plan', { testId: 'plan-kanban' })

    const card = page.locator('[data-testid="kanban-column-todo"] [data-testid^="kanban-card-"]').first()
    const title = (await card.locator('h4').innerText()).trim()

    await page.getByLabel(`Переместить «${title}» вправо`, { exact: true }).click()
    const inDoing = page
      .locator('[data-testid="kanban-column-doing"] [data-testid^="kanban-card-"]')
      .filter({ hasText: title })
    await expect(inDoing).toBeVisible()

    await page.getByLabel(`Переместить «${title}» влево`, { exact: true }).click()
    await expect(
      page
        .locator('[data-testid="kanban-column-todo"] [data-testid^="kanban-card-"]')
        .filter({ hasText: title }),
    ).toBeVisible()
  })

  test('перетаскивание карточки в колонку «Готово» (drag&drop)', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'plan', { testId: 'plan-kanban' })

    const card = page.locator('[data-testid="kanban-column-todo"] [data-testid^="kanban-card-"]').first()
    const title = (await card.locator('h4').innerText()).trim()

    await card.dragTo(page.getByTestId('kanban-column-done'))
    const inDone = page
      .locator('[data-testid="kanban-column-done"] [data-testid^="kanban-card-"]')
      .filter({ hasText: title })
    await expect(inDone).toBeVisible()

    // Возвращаем задачу в «К выполнению» (done → doing → todo), чтобы не менять демо-данные.
    await page.getByLabel(`Переместить «${title}» влево`, { exact: true }).click()
    await page.getByLabel(`Переместить «${title}» влево`, { exact: true }).click()
    await expect(
      page
        .locator('[data-testid="kanban-column-todo"] [data-testid^="kanban-card-"]')
        .filter({ hasText: title }),
    ).toBeVisible()
  })

  test('фильтр по этапу оставляет только задачи этапа', async ({ page }) => {
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'plan', { testId: 'plan-kanban' })

    const cards = page.locator('[data-testid^="kanban-card-"]')
    const total = await cards.count()

    await pickOption(page, page.getByLabel('Фильтр по этапу'), 'Подготовка')

    const filtered = await cards.count()
    expect(filtered).toBeGreaterThan(0)
    expect(filtered).toBeLessThan(total)

    // У каждой оставшейся карточки — чип выбранного этапа.
    const filteredCards = await page.locator('[data-testid^="kanban-card-"]').all()
    for (const card of filteredCards) {
      await expect(card.getByText('Подготовка', { exact: true })).toBeVisible()
    }

    await shot(page, '09-plan-stage-filter')
  })
})
