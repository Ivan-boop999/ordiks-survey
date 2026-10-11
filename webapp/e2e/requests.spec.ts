import { test, expect } from '@playwright/test'

import { DEMO_USERS, logIn, openDemoProject, openSection, pickOption, shot, uniqueSuffix } from './demo-helpers'

test.describe('Запросы данных', () => {
  test('создание запроса; заказчик берёт в работу и отмечает получение', async ({ page, browser }) => {
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

    // Смена роли: отдельный чистый контекст браузера (выход через меню сейчас
    // намертво подвешивает страницу /survey/* — заведён продукт-баг, см. отчёт).
    const clientContext = await browser.newContext()
    const clientPage = await clientContext.newPage()
    await logIn(clientPage, DEMO_USERS.clientLead)
    await openDemoProject(clientPage)

    // На дашборде клиента — блок «Ждём от вас» с нашим запросом и кнопками.
    await expect(clientPage.getByText('Ждём от вас', { exact: true })).toBeVisible()
    const waitingRows = clientPage.getByTestId('dashboard-waiting-list').locator(':scope > div')
    const waitingRow = waitingRows.filter({ hasText: what })
    await expect(waitingRow).toBeVisible()

    await shot(clientPage, '15-request-client-dashboard')

    // «Взять в работу»: кнопка исчезает, остаётся только «Получено».
    await waitingRow.getByRole('button', { name: 'Взять в работу' }).click()
    await expect(waitingRow.getByRole('button', { name: 'Взять в работу' })).toHaveCount(0)
    await expect(waitingRow.getByRole('button', { name: 'Получено' })).toBeVisible()

    // «Получено» — запрос уходит из списка ожидания.
    await waitingRow.getByRole('button', { name: 'Получено' }).click()
    await expect(waitingRow).toHaveCount(0)

    // В разделе «Запросы» (вкладка «Полученные» — по умолчанию открыты открытые)
    // строка со статусом «Получено».
    await openSection(clientPage, 'requests')
    await clientPage.getByRole('button', { name: 'Полученные' }).click()
    const row = clientPage.getByTestId('request-row').filter({ hasText: what })
    await expect(row).toBeVisible()
    await expect(row.getByText('Получено', { exact: true })).toBeVisible()

    await shot(clientPage, '16-request-received')

    await clientContext.close()
  })
})
