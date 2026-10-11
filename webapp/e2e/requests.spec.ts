import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, logOut, openDemoProject, openSection, pickOption, shot, uniqueSuffix } from './demo-helpers'

test.describe('Запросы данных', () => {
  test('создание запроса; заказчик берёт в работу и отмечает получение', async ({ page }) => {
    const what = `E2E выгрузка отгрузок ${uniqueSuffix()}`

    // Команда ОРДИКС создаёт запрос и назначает ответственного с клиентской стороны.
    await logIn(page, DEMO_USERS.owner)
    await openDemoProject(page)
    await openSection(page, 'requests')

    await page.getByTestId('request-create-open').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Новый запрос данных')

    await dialog.getByTestId('request-what').fill(what)
    await dialog.locator('#request-why').fill('Нужна для проверки двойного ввода.')
    await pickOption(dialog, dialog.getByText('— не назначен —'), 'Рустем Гареев')
    await dialog.locator('#request-deadline').fill('2026-11-20')

    await shot(page, '14-request-modal')

    await dialog.getByTestId('request-save').click()
    await expect(page.getByTestId('request-row').filter({ hasText: what })).toBeVisible()

    // Смена роли: выходим и входим директором заказчика.
    await logOut(page)
    await logIn(page, DEMO_USERS.clientLead)
    await openDemoProject(page)

    // На дашборде клиента — блок «Ждём от вас» с нашим запросом и кнопками.
    await expect(page.getByText('Ждём от вас', { exact: true })).toBeVisible()
    const waitingRowText = page.getByTestId('dashboard-waiting-list').getByText(what, { exact: true })
    await expect(waitingRowText).toBeVisible()

    await shot(page, '15-request-client-dashboard')

    // «Взять в работу» — кнопка в соседнем блоке строки ожидания.
    const startButton = waitingRowText.locator('xpath=../following-sibling::div[1]/button[1]')
    await startButton.click()
    await expect(
      waitingRowText.locator('xpath=../following-sibling::div[1]').getByText('В работе'),
    ).toBeVisible()

    // «Получено» — запрос уходит из списка ожидания.
    const receivedButton = waitingRowText.locator('xpath=../following-sibling::div[1]/button[last()]')
    await receivedButton.click()
    await expect(waitingRowText).toHaveCount(0)

    // В разделе «Запросы» строка со статусом «Получено».
    await openSection(page, 'requests')
    const row = page.getByTestId('request-row').filter({ hasText: what })
    await expect(row).toBeVisible()
    await expect(row.getByText('Получено', { exact: true })).toBeVisible()

    await shot(page, '16-request-received')
  })
})
