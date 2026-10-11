import { defineConfig, devices } from '@playwright/test'

/**
 * E2E реальных кликов по живому продукту «Ордикс Обследование» (headless Chromium).
 *
 * Окружение: backend уже поднят отдельным процессом на :3100 с демо-базой
 * (docker-compose postgres :15432 + `DEMO_SEED_ALLOWED=1 bun scripts/seed-demo.ts`,
 * старт `DATABASE_URL=... PORT=3100 bun run start:api`), этот конфиг сам поднимает
 * только Vite на :5173. Демо-кнопки входа включаются через VITE_DEMO_HINTS=1.
 *
 * Исходный конфиг шаблона vibe (тестовая БД в Docker, порты по хэшу репозитория)
 * перенесён в e2e/vibe.config.ts: `bunx playwright test --config e2e/vibe.config.ts`.
 */

const backendUrl = process.env.E2E_API_URL ?? 'http://localhost:3100'
const frontendPort = 5173
const frontendUrl = `http://localhost:${frontendPort}`

function normalizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

export default defineConfig({
  testDir: './e2e',
  // Наборы шаблона (specs/, screens/) принадлежат e2e/vibe.config.ts.
  testIgnore: ['**/specs/**', '**/screens/**'],
  outputDir: './e2e/.artifacts/demo-results',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.artifacts/demo-report' }]],
  use: {
    baseURL: frontendUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Локальные адресы не должны уходить в системный прокей разработчика.
        launchOptions: { args: ['--no-proxy-server'] },
      },
    },
  ],
  webServer: [
    {
      command: `bun run dev --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: normalizeEnv({
        ...process.env,
        VITE_API_URL: backendUrl,
        VITE_DEMO_HINTS: '1',
        VITE_DEMO_PASSWORD: 'ordiks-demo',
      }),
    },
  ],
})
