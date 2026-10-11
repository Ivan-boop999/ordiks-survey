import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Хелперы демо-E2E «Ордикс Обследование»: вход через UI, навигация по разделам,
 * скриншоты в e2e/.artifacts/demo-screens.
 *
 * Продукт: backend :3100 с демо-сидом (`DEMO_SEED_ALLOWED=1 bun scripts/seed-demo.ts`),
 * пароль всех демо-аккаунтов — `ordiks-demo`.
 */

export const DEMO_PASSWORD = 'ordiks-demo'

export const DEMO_USERS = {
  owner: 'ivan@ordiks.ru',
  manager: 'anna@ordiks.ru',
  clientLead: 'rustem@demo.ordiks.ru',
  clientStaff: 'marat@demo.ordiks.ru',
  observer: 'sergey@demo.ordiks.ru',
} as const

export const DEMO_PROJECT_NAME = 'ЖБИ-завод, Уфа'

/** Уникальный суффикс, чтобы данные тестов не конфликтовали между прогонами. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Скриншот ключевого шага (полная страница). */
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `e2e/.artifacts/demo-screens/${name}.png`,
    fullPage: true,
  })
}

/** Вход через форму /login и ожидание редиректа в приложение обследования. */
export async function logIn(page: Page, email: string, password = DEMO_PASSWORD): Promise<void> {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('survey-navigation')).toBeVisible()
}

/** Выход через меню аккаунта. */
export async function logOut(page: Page): Promise<void> {
  await page.getByTestId('account-menu').click()
  await page.getByTestId('account-menu-logout').click()
  await expect(page.getByTestId('login-form')).toBeVisible()
}

/** /survey → дашборд демо-проекта по умолчанию. */
export async function openDemoProject(page: Page): Promise<void> {
  await page.goto('/survey')
  await expect(page.getByTestId('dashboard-kpis')).toBeVisible()
  await expect(page.getByTestId('dashboard-project-name')).toHaveText(DEMO_PROJECT_NAME)
}

/** Клик по разделу в сайдбаре и ожидание появления его содержимого. */
export async function openSection(
  page: Page,
  section: string,
  expected?: { testId?: string; text?: string },
): Promise<void> {
  await page.getByTestId(`survey-nav-${section}`).click()
  if (expected?.testId) {
    await expect(page.getByTestId(expected.testId).first()).toBeVisible()
  }
  if (expected?.text) {
    await expect(page.getByText(expected.text).first()).toBeVisible()
  }
}

/** shadcn/Base UI Select: клик по триггеру, затем по option из портала. */
export async function pickOption(
  scope: Page | Locator,
  trigger: string | Locator,
  option: string,
): Promise<void> {
  const triggerLocator = typeof trigger === 'string' ? scope.locator(trigger) : trigger
  await triggerLocator.click()
  // Список опций рендерится в портал на уровне страницы.
  const page = 'page' in scope ? scope.page() : scope
  await page.getByRole('option', { name: option, exact: true }).click()
}
