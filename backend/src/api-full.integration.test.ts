import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from './app'
import { createPrisma, type DbClient } from './db'
import type { EmailDelivery, EmailMessage } from './email'
import { loadEnv } from './env'
import { drainTaskOutbox } from './outbox'
import type { BackendRuntime } from './runtime'
import { privateStorageConfigFromEnv, type FilesystemStorageConfig } from './storage/config'
import { createFilesystemStorageRoutes } from './storage/filesystem-routes'
import { FilesystemPrivateStorage } from './storage/filesystem-storage'

/**
 * Полный интеграционный прогон API «Ордикс Обследование»: каждый маршрут каждого модуля
 * против живого приложения in-process и живого PostgreSQL (TEST_DATABASE_URL).
 *
 * Полноматрица прав, ксерокс-сценарии загрузки файлов, условная логика гайдов/интервью,
 * каскады SetNull, лимиты контрактов и невалидные UUID — всё поверх реальных HTTP-вызовов.
 */

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

const PASSWORD = 'password-1234'

const defaultTemplate = {
  stageNames: ['Диагностика', 'Выезд'],
  groups: ['Операции', 'Качество'],
  domains: [
    { groupIndex: 0, name: 'Планирование', checklist: ['План производства', 'Сменные задания'] },
    { groupIndex: 1, name: 'ОТК', checklist: ['Контроль готовой продукции'] },
  ],
}

type Json = Record<string, any>
type Session = { accessToken: string; refreshToken: string; user: { id: string; email: string } }
type App = ReturnType<typeof createApp>

describe('Full API integration (every module, permissions, edge cases)', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: 'http://localhost:5173',
    ACCESS_TOKEN_TTL_SECONDS: '3600',
    AUTH_RATE_LIMIT_MAX: '100000',
    ADMIN_USERS_READ_RATE_LIMIT_MAX: '100000',
  })
  const prisma = createPrisma(databaseUrl)
  const roots: string[] = []
  let app: App

  beforeEach(async () => {
    await prisma.invite.deleteMany()
    await prisma.project.deleteMany()
    await prisma.projectTemplate.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.passwordResetToken.deleteMany()
    await prisma.taskOutbox.deleteMany()
    await prisma.user.deleteMany()

    const root = await mkdtemp(join(tmpdir(), 'api-full-'))
    roots.push(root)
    const config = privateStorageConfigFromEnv({
      ...env,
      PRIVATE_STORAGE_LOCAL_ROOT: root,
    }) as FilesystemStorageConfig
    const storage = new FilesystemPrivateStorage(config)
    app = createApp({
      env,
      prisma,
      privateStorage: { storage, httpRoutes: createFilesystemStorageRoutes(config) },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  })

  // ------------------------------------------------------------------
  // Хелперы
  // ------------------------------------------------------------------

  /**
   * Все сущностные маршруты живут под /api; префикс проставляется автоматически, кроме
   * инфраструктурных (/, /health*, /openapi.json) и подписанных URL хранилища (/storage).
   */
  function withApi(path: string): string {
    if (path === '/' || path.startsWith('/api') || path.startsWith('/storage') || path.startsWith('/health') || path.startsWith('/openapi')) {
      return path
    }
    return `/api${path}`
  }

  async function call(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) {
    const headers: Record<string, string> = { ...opts.headers }
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`
    let body: string | undefined
    if (opts.body !== undefined) {
      body = JSON.stringify(opts.body)
      headers['Content-Type'] = 'application/json'
    }
    return app.request(withApi(path), { method, headers, body })
  }

  async function req<T = Json>(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; data: T }> {
    const response = await call(method, path, opts)
    const text = await response.text()
    return { status: response.status, data: text ? (JSON.parse(text) as T) : ({} as T) }
  }

  /** Регистрирует пользователя и (опционально) поднимает orgRole/admin напрямую в БД. */
  async function user(
    email: string,
    opts: { orgRole?: 'owner' | 'manager' | 'analyst' | 'client'; admin?: boolean } = {},
  ): Promise<Session> {
    const { status, data } = await req<Session>('POST', '/api/auth/token/register', {
      body: { email, password: PASSWORD },
    })
    expect(status).toBe(201)
    const session = data as Session
    const updates: Record<string, string> = {}
    if (opts.orgRole && opts.orgRole !== 'client') updates.orgRole = opts.orgRole
    if (opts.admin) updates.role = 'admin'
    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: session.user.id }, data: updates as never })
    }
    return session
  }

  async function project(session: Session, extra: Record<string, unknown> = {}): Promise<string> {
    const { status, data } = await req<Json>('POST', '/api/projects', {
      token: session.accessToken,
      body: { name: extra.name ?? 'Завод СтройБетон', client: 'ООО «СтройБетон»', template: defaultTemplate, ...extra },
    })
    expect(status).toBe(201)
    return (data as Json).id as string
  }

  async function member(manager: Session, projectId: string, userId: string, role: string) {
    return req('POST', `/api/projects/${projectId}/members`, {
      token: manager.accessToken,
      body: { userId, role },
    })
  }

  async function firstDomainId(session: Session, projectId: string): Promise<string> {
    const { data } = await req<Json>('GET', `/api/projects/${projectId}/domain-groups`, { token: session.accessToken })
    return (data as Json).items[0].domains[0].id as string
  }

  /** Минимальный PNG: сигнатура + паддинг. */
  function png(bytes = 64) {
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(bytes, 0x20)])
  }

  const png100 = () => png(92)

  // ------------------------------------------------------------------
  // 1. Инфраструктура
  // ------------------------------------------------------------------

  test('infra: /, /health, /health/live, /health/ready, /openapi.json', async () => {
    for (const path of ['/', '/health', '/health/live', '/health/ready']) {
      const { status, data } = await req<Json>('GET', path)
      expect(status).toBe(200)
      expect((data as Json).status).toBe('ok')
    }
    const spec = await req<Json>('GET', '/openapi.json')
    expect(spec.status).toBe(200)
    expect(Object.keys(spec.data.paths ?? {}).length).toBeGreaterThan(100)
  })

  // ------------------------------------------------------------------
  // 2. Auth: token-поток
  // ------------------------------------------------------------------

  test('auth token: register/login/me/refresh/logout + негативные', async () => {
    const email = 'au-token@ordiks.ru'
    const registered = await req<Session>('POST', '/api/auth/token/register', { body: { email, password: PASSWORD } })
    expect(registered.status).toBe(201)
    expect(registered.data.user.email).toBe(email)
    expect(registered.data.accessToken).toBeTruthy()
    expect(registered.data.refreshToken).toBeTruthy()

    // Дубль email → 409; слабый пароль → 400; кривой email → 400.
    expect((await req('POST', '/api/auth/token/register', { body: { email, password: PASSWORD } })).status).toBe(409)
    expect((await req('POST', '/api/auth/token/register', { body: { email: 'x@ordiks.ru', password: 'short' } })).status).toBe(400)
    expect((await req('POST', '/api/auth/token/register', { body: { email: 'not-an-email', password: PASSWORD } })).status).toBe(400)

    // /me: валидный токен, без токена, мусорный токен.
    const me = await req<Json>('GET', '/api/auth/me', { token: registered.data.accessToken })
    expect(me.status).toBe(200)
    expect(me.data.user.email).toBe(email)
    expect((await req('GET', '/api/auth/me')).status).toBe(401)
    expect((await req('GET', '/api/auth/me', { token: 'garbage.token.here' })).status).toBe(401)

    // Логин: верный/неверный пароль/неизвестный email.
    const login = await req<Session>('POST', '/api/auth/token/login', { body: { email, password: PASSWORD } })
    expect(login.status).toBe(200)
    expect((await req('POST', '/api/auth/token/login', { body: { email, password: 'wrong-password-1' } })).status).toBe(401)
    expect((await req('POST', '/api/auth/token/login', { body: { email: 'ghost@ordiks.ru', password: PASSWORD } })).status).toBe(401)

    // Refresh ротируется; окно повторного использования (REFRESH_REUSE_GRACE_SECONDS=10 по
    // умолчанию) терпит немедленный повтор старого токена — это осознанное поведение для
    // конкурирующих вкладок, а не дыра.
    const refreshed = await req<Json>('POST', '/api/auth/token/refresh', { body: { refreshToken: login.data.refreshToken } })
    expect(refreshed.status).toBe(200)
    expect(refreshed.data.accessToken).toBeTruthy()
    expect(refreshed.data.refreshToken).not.toBe(login.data.refreshToken)
    expect((await req('POST', '/api/auth/token/refresh', { body: { refreshToken: login.data.refreshToken } })).status).toBe(200)
    expect((await req('POST', '/api/auth/token/refresh', { body: { refreshToken: 'x'.repeat(40) } })).status).toBe(401)

    // Logout отзывает семейство: свежайший refresh больше не работает.
    const secondRefresh = await req<Json>('POST', '/api/auth/token/refresh', { body: { refreshToken: refreshed.data.refreshToken } })
    expect(secondRefresh.status).toBe(200)
    expect((await req('POST', '/api/auth/token/logout', { body: { refreshToken: secondRefresh.data.refreshToken } })).status).toBe(204)
    expect((await req('POST', '/api/auth/token/refresh', { body: { refreshToken: secondRefresh.data.refreshToken } })).status).toBe(401)
  })

  // ------------------------------------------------------------------
  // 3. Auth: cookie-поток + password reset
  // ------------------------------------------------------------------

  test('auth cookie + password-reset: login по cookie, ротация, logout, сброс пароля', async () => {
    const email = 'au-cookie@ordiks.ru'
    await user(email)

    const login = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } })
    expect(login.status).toBe(200)
    const setCookie = login.headers.getSetCookie().find((value) => value.startsWith('ordiks_survey_refresh='))
    expect(setCookie).toBeTruthy()
    const cookie = setCookie!.split(';')[0]

    const refreshed = await req<Json>('POST', '/api/auth/refresh', { headers: { Cookie: cookie }, body: {} })
    expect(refreshed.status).toBe(200)
    expect(refreshed.data.accessToken).toBeTruthy()
    // Окно повторного использования: немедленный повтор старой cookie допустим (см. token-тест).
    expect((await req('POST', '/api/auth/refresh', { headers: { Cookie: cookie }, body: {} })).status).toBe(200)

    // Logout по cookie.
    const login2 = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } })
    const cookie2 = login2.headers.getSetCookie().find((value) => value.startsWith('ordiks_survey_refresh='))!.split(';')[0]
    expect((await call('POST', '/api/auth/logout', { headers: { Cookie: cookie2 }, body: {} })).status).toBe(204)
    expect((await req('POST', '/api/auth/refresh', { headers: { Cookie: cookie2 }, body: {} })).status).toBe(401)

    // Cookie-регистрация работает отдельно от token-регистрации.
    expect((await call('POST', '/api/auth/register', { body: { email: 'au-cookie-2@ordiks.ru', password: PASSWORD } })).status).toBe(201)
    expect((await call('POST', '/api/auth/register', { body: { email: 'au-cookie-2@ordiks.ru', password: PASSWORD } })).status).toBe(409)

    // Password reset: неизвестный email не палит существование (202 accepted всегда).
    const unknown = await req<Json>('POST', '/api/auth/password-reset/request', { body: { email: 'nobody@ordiks.ru' } })
    expect(unknown.status).toBe(202)
    expect(unknown.data.accepted).toBe(true)

    // Полный цикл требует настроенной доставки: запрос ставит задачу в outbox, токен
    // рождается при drain и приходит письмом. Поднимаем отдельное приложение с доставкой.
    const messages: EmailMessage[] = []
    const emailDelivery: EmailDelivery = {
      driver: 'console',
      configured: true,
      send: async (message) => {
        messages.push(message)
      },
    }
    const emailApp = createApp({ emailDelivery, env, prisma })
    const resetRequest = await emailApp.request('/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    expect(resetRequest.status).toBe(202)
    expect(await prisma.passwordResetToken.count()).toBe(0)
    const drained = await drainTaskOutbox({ emailDelivery, env, prisma } as unknown as BackendRuntime, { now: new Date() })
    expect(drained.done).toBe(1)
    expect(messages).toHaveLength(1)
    const resetUrlText = messages[0]!.text
      .split('\n\n')
      .find((part) => part.startsWith('http'))!
    const token = new URLSearchParams(new URL(resetUrlText).hash.slice(1)).get('token')!
    expect(token).toHaveLength(43)

    // Кривой токен → 400; корректный → 204, старый пароль мёртв, новый работает; повтор токена → 400.
    expect((await req('POST', '/api/auth/password-reset/confirm', { body: { token: 'x'.repeat(48), password: 'new-password-123' } })).status).toBe(400)
    expect((await req('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'new-password-123' } })).status).toBe(204)
    expect((await req('POST', '/api/auth/token/login', { body: { email, password: PASSWORD } })).status).toBe(401)
    expect((await req('POST', '/api/auth/token/login', { body: { email, password: 'new-password-123' } })).status).toBe(200)
    expect((await req('POST', '/api/auth/password-reset/confirm', { body: { token, password: 'another-password-1' } })).status).toBe(400)
  })

  // ------------------------------------------------------------------
  // 4. Users: профиль + админ-справочник
  // ------------------------------------------------------------------

  test('users: PATCH /users/me, админ-маршруты (dashboard, список, роль), запрет не-админу', async () => {
    const plain = await user('us-plain@ordiks.ru')
    const admin = await user('us-admin@ordiks.ru', { admin: true })
    const owner = await user('us-owner@ordiks.ru', { orgRole: 'owner' })

    const updated = await req<Json>('PATCH', '/api/users/me', { token: plain.accessToken, body: { displayName: 'Иван Тестов' } })
    expect(updated.status).toBe(200)
    expect(updated.data.user.displayName).toBe('Иван Тестов')
    // Обнуление displayName и невалидное значение.
    expect((await req('PATCH', '/api/users/me', { token: plain.accessToken, body: { displayName: null } })).status).toBe(200)
    expect((await req('PATCH', '/api/users/me', { token: plain.accessToken, body: { displayName: 'a' } })).status).toBe(400)
    expect((await req('PATCH', '/api/users/me', { body: { displayName: 'Аноним' } })).status).toBe(401)

    // Админ-маршруты: только role=admin (orgRole owner без admin-флага — не пускает).
    expect((await req('GET', '/api/admin/dashboard', { token: admin.accessToken })).status).toBe(200)
    expect((await req('GET', '/api/admin/dashboard', { token: owner.accessToken })).status).toBe(403)
    expect((await req('GET', '/api/admin/dashboard', { token: plain.accessToken })).status).toBe(403)

    const list = await req<Json>('GET', '/api/admin/users', { token: admin.accessToken })
    expect(list.status).toBe(200)
    expect(list.data.items.length).toBeGreaterThanOrEqual(3)
    const withQuery = await req<Json>('GET', '/api/admin/users?q=us-plain', { token: admin.accessToken })
    expect(withQuery.data.items.map((item: Json) => item.email)).toEqual(['us-plain@ordiks.ru'])

    // Смена роли user → admin; смена роли отзывает сессии: старый токен → 401, после
    // повторного логина новый админ читает справочник. Невалидный UUID → 400; несуществующий → 404.
    const promoted = await req<Json>('PATCH', `/api/admin/users/${plain.user.id}/role`, {
      token: admin.accessToken,
      body: { role: 'admin' },
    })
    expect(promoted.status).toBe(200)
    expect(promoted.data.user.role).toBe('admin')
    expect((await req('GET', '/api/admin/users', { token: plain.accessToken })).status).toBe(401)
    const relogged = await req<Session>('POST', '/api/auth/token/login', { body: { email: 'us-plain@ordiks.ru', password: PASSWORD } })
    expect((await req('GET', '/api/admin/users', { token: relogged.data.accessToken })).status).toBe(200)
    expect((await req('PATCH', '/api/admin/users/not-a-uuid/role', { token: admin.accessToken, body: { role: 'admin' } })).status).toBe(400)
    expect((await req('PATCH', '/api/admin/users/00000000-0000-4000-8000-000000000001/role', {
      token: admin.accessToken,
      body: { role: 'user' },
    })).status).toBe(404)
    expect((await req('PATCH', `/api/admin/users/${owner.user.id}/role`, { token: relogged.data.accessToken, body: { role: 'user' } })).status).toBe(200)
  })

  // ------------------------------------------------------------------
  // 5. Uploads: аватар тикет → PUT → finalize → get → delete
  // ------------------------------------------------------------------

  test('uploads: аватар полный цикл + невалидные типы/размеры', async () => {
    const session = await user('up-user@ordiks.ru')
    const bytes = png100()

    expect((await req('GET', '/api/uploads/avatar')).status).toBe(401)

    const empty = await req<Json>('GET', '/api/uploads/avatar', { token: session.accessToken })
    expect(empty.status).toBe(200)

    const ticket = await req<Json>('POST', '/api/uploads/avatar', {
      token: session.accessToken,
      body: { contentType: 'image/png', byteSize: bytes.byteLength },
    })
    expect(ticket.status).toBe(201)
    const upload = ticket.data.upload as Json
    const put = await app.request(upload.url as string, {
      method: 'PUT',
      headers: upload.headers as Record<string, string>,
      body: bytes,
    })
    expect(put.status).toBe(200)

    // Finalize до/после: объект на месте → 200.
    const finalized = await req<Json>('POST', `/api/uploads/avatar/${upload.uploadId}/finalize`, { token: session.accessToken })
    expect(finalized.status).toBe(200)
    expect(finalized.data.avatar).toBeTruthy()

    const current = await req<Json>('GET', '/api/uploads/avatar', { token: session.accessToken })
    expect(current.status).toBe(200)
    expect(current.data.avatar).toBeTruthy()

    const removed = await req<Json>('DELETE', '/api/uploads/avatar', { token: session.accessToken })
    expect(removed.status).toBe(200)
    expect(removed.data.avatar).toBeNull()

    // Неверный content-type и слишком маленький размер → 400 контрактом.
    expect((await req('POST', '/api/uploads/avatar', {
      token: session.accessToken,
      body: { contentType: 'text/plain', byteSize: 100 },
    })).status).toBe(400)
    expect((await req('POST', '/api/uploads/avatar', {
      token: session.accessToken,
      body: { contentType: 'image/png', byteSize: 10 },
    })).status).toBe(400)
    // Несуществующий upload → 404.
    expect((await req('POST', '/api/uploads/avatar/00000000-0000-4000-8000-000000000002/finalize', {
      token: session.accessToken,
    })).status).toBe(404)
  })

  // ------------------------------------------------------------------
  // 6. Invites: create → accept → дубль кода, деактивация, проектные инвайты
  // ------------------------------------------------------------------

  test('invites: создание, приём, повтор кода, деактивация, истечение, права', async () => {
    const owner = await user('in-owner@ordiks.ru', { orgRole: 'owner' })
    const manager = await user('in-manager@ordiks.ru', { orgRole: 'manager' })
    const analyst = await user('in-analyst@ordiks.ru', { orgRole: 'analyst' })
    const projectId = await project(manager)

    // Создавать/смотреть могут owner и manager; analyst и client — нет.
    const created = await req<Json>('POST', '/api/invites', { token: owner.accessToken, body: { orgRole: 'analyst', note: 'Новый аналитик' } })
    expect(created.status).toBe(201)
    expect(created.data.code).toBeTruthy()
    expect(created.data.active).toBe(true)
    expect((await req('GET', '/api/invites', { token: owner.accessToken })).status).toBe(200)
    expect((await req('POST', '/api/invites', { token: analyst.accessToken, body: { orgRole: 'analyst' } })).status).toBe(403)
    expect((await req('GET', '/api/invites', { token: analyst.accessToken })).status).toBe(403)

    // Приём: аккаунт создаётся с ролью из инвайта.
    const accepted = await req<Json>('POST', '/api/invites/accept', {
      body: { code: created.data.code, email: 'in-new@ordiks.ru', password: PASSWORD, displayName: 'Новый Аналитик' },
    })
    expect(accepted.status).toBe(201)
    expect(accepted.data.orgRole).toBe('analyst')
    const newbie = await req<Session>('POST', '/api/auth/token/login', { body: { email: 'in-new@ordiks.ru', password: PASSWORD } })
    expect(newbie.status).toBe(200)

    // Повтор уже использованного кода → 400; занятый email → 409; кривой код → 400.
    expect((await req('POST', '/api/invites/accept', { body: { code: created.data.code, email: 'in-other@ordiks.ru', password: PASSWORD } })).status).toBe(400)
    const fresh = await req<Json>('POST', '/api/invites', { token: manager.accessToken, body: { orgRole: 'client' } })
    expect(fresh.status).toBe(201)
    expect((await req('POST', '/api/invites/accept', { body: { code: fresh.data.code, email: 'in-owner@ordiks.ru', password: PASSWORD } })).status).toBe(409)
    expect((await req('POST', '/api/invites/accept', { body: { code: 'nope', email: 'in-x@ordiks.ru', password: PASSWORD } })).status).toBe(400)

    // Проект без memberRole → 400 контрактом.
    expect((await req('POST', '/api/invites', { token: manager.accessToken, body: { orgRole: 'client', projectId } })).status).toBe(400)

    // Проектный инвайт: после приёма пользователь видит проект.
    const projectInvite = await req<Json>('POST', '/api/invites', {
      token: manager.accessToken,
      body: { orgRole: 'client', projectId, memberRole: 'client_lead' },
    })
    expect(projectInvite.status).toBe(201)
    const acceptedClient = await req<Json>('POST', '/api/invites/accept', {
      body: { code: projectInvite.data.code, email: 'in-client@demo.ordiks.ru', password: PASSWORD },
    })
    expect(acceptedClient.status).toBe(201)
    expect(acceptedClient.data.projectId).toBe(projectId)
    expect(acceptedClient.data.memberRole).toBe('client_lead')
    const clientLogin = await req<Session>('POST', '/api/auth/token/login', { body: { email: 'in-client@demo.ordiks.ru', password: PASSWORD } })
    const visible = await req<Json>('GET', '/api/projects', { token: clientLogin.data.accessToken })
    expect(visible.data.items.map((item: Json) => item.id)).toContain(projectId)

    // Деактивация: accept погашенного кода → 400.
    const deactivated = await req<Json>('DELETE', `/api/invites/${fresh.data.id}`, { token: manager.accessToken })
    expect(deactivated.status).toBe(200)
    expect(deactivated.data.active).toBe(false)
    expect((await req('POST', '/api/invites/accept', { body: { code: fresh.data.code, email: 'in-late@ordiks.ru', password: PASSWORD } })).status).toBe(400)

    // Истёкший инвайт → 400.
    const expired = await req<Json>('POST', '/api/invites', {
      token: owner.accessToken,
      body: { orgRole: 'client', expiresAt: new Date(Date.now() - 60_000).toISOString() },
    })
    expect(expired.status).toBe(201)
    expect((await req('POST', '/api/invites/accept', { body: { code: expired.data.code, email: 'in-exp@ordiks.ru', password: PASSWORD } })).status).toBe(400)

    // Удаление несуществующего/невалидного инвайта.
    expect((await req('DELETE', '/api/invites/00000000-0000-4000-8000-000000000003', { token: owner.accessToken })).status).toBe(404)
    expect((await req('DELETE', '/api/invites/oops', { token: owner.accessToken })).status).toBe(400)
  })

  // ------------------------------------------------------------------
  // 7. Projects + members: CRUD, статус, права, невалидный UUID, 404 постороннему
  // ------------------------------------------------------------------

  test('projects: создание из шаблона, паспорт, правка, архив, члены, посторонний 404', async () => {
    const analyst = await user('pr-analyst@ordiks.ru', { orgRole: 'analyst' })
    const manager = await user('pr-manager@ordiks.ru', { orgRole: 'manager' })
    const lead = await user('pr-lead@demo.ordiks.ru')
    const staff = await user('pr-staff@demo.ordiks.ru')
    const observer = await user('pr-observer@demo.ordiks.ru')
    const outsider = await user('pr-outsider@demo.ordiks.ru')

    // Клиент не создаёт проекты.
    expect((await req('POST', '/api/projects', { token: outsider.accessToken, body: { name: 'Нет' } })).status).toBe(403)
    // Слишком короткое имя → 400.
    expect((await req('POST', '/api/projects', { token: analyst.accessToken, body: { name: 'Я' } })).status).toBe(400)

    const created = await req<Json>('POST', '/api/projects', {
      token: analyst.accessToken,
      body: {
        name: 'Мясокомбинат Дым',
        client: 'АО «Дым»',
        city: 'Казань',
        shops: ['Цех 1', 'Цех 2'],
        boundaries: 'В пределах производства',
        goals: 'Снизить потери',
        template: defaultTemplate,
      },
    })
    expect(created.status).toBe(201)
    const projectId = created.data.id as string
    expect(created.data.access).toMatchObject({ view: true, edit: true })

    // Структура из шаблона развёрнута.
    const stages = await req<Json>('GET', `/api/projects/${projectId}/stages`, { token: analyst.accessToken })
    expect(stages.data.items.map((stage: Json) => stage.name)).toEqual(['Диагностика', 'Выезд'])
    const groups = await req<Json>('GET', `/api/projects/${projectId}/domain-groups`, { token: analyst.accessToken })
    expect(groups.data.items.map((group: Json) => group.name)).toEqual(['Операции', 'Качество'])

    // Паспорт: команда видит, посторонний клиент — 404, невалидный UUID — 400.
    const detail = await req<Json>('GET', `/api/projects/${projectId}`, { token: analyst.accessToken })
    expect(detail.status).toBe(200)
    expect(detail.data.name).toBe('Мясокомбинат Дым')
    expect(detail.data.settings).toBeTruthy()
    expect((await req('GET', `/api/projects/${projectId}`, { token: outsider.accessToken })).status).toBe(404)
    expect((await req('GET', '/api/projects/not-a-uuid', { token: analyst.accessToken })).status).toBe(400)
    expect((await req('GET', '/api/projects/00000000-0000-4000-8000-000000000004', { token: analyst.accessToken })).status).toBe(404)

    // Список: команда видит оба проекта, посторонний — пусто.
    await project(analyst, { name: 'Второй проект' })
    const listAnalyst = await req<Json>('GET', '/api/projects', { token: analyst.accessToken })
    expect(listAnalyst.data.items.length).toBe(2)
    const listOutsider = await req<Json>('GET', '/api/projects', { token: outsider.accessToken })
    expect(listOutsider.data.items).toEqual([])

    // Правка паспорта: аналитик может, клиент_lead — нет (после добавления в проект).
    const patched = await req<Json>('PATCH', `/api/projects/${projectId}`, {
      token: analyst.accessToken,
      body: { goals: 'Снизить потери на 15%', city: 'Набережные Челны' },
    })
    expect(patched.status).toBe(200)
    expect(patched.data.goals).toBe('Снизить потери на 15%')

    // Члены: добавление (owner/manager), дубликат → 409, клиент_lead не добавляет.
    const added = await member(manager, projectId, lead.user.id, 'client_lead')
    expect(added.status).toBe(201)
    expect((await member(manager, projectId, lead.user.id, 'client_lead')).status).toBe(409)
    expect((await member(lead, projectId, staff.user.id, 'client_staff')).status).toBe(403)
    expect((await member(manager, projectId, observer.user.id, 'observer')).status).toBe(201)

    const members = await req<Json>('GET', `/api/projects/${projectId}/members`, { token: observer.accessToken })
    expect(members.status).toBe(200)
    expect(members.data.items.map((item: Json) => item.userId)).toContain(lead.user.id)

    // Смена роли участника.
    const promoted = await req<Json>('PATCH', `/api/projects/${projectId}/members/${members.data.items.find((item: Json) => item.userId === observer.user.id).id}`, {
      token: manager.accessToken,
      body: { role: 'client_staff' },
    })
    expect(promoted.status).toBe(200)
    expect(promoted.data.role).toBe('client_staff')

    // После добавления client_lead видит паспорт, но не правит его.
    expect((await req('GET', `/api/projects/${projectId}`, { token: lead.accessToken })).status).toBe(200)
    expect((await req('PATCH', `/api/projects/${projectId}`, { token: lead.accessToken, body: { goals: 'Нет' } })).status).toBe(403)
    expect((await req('GET', `/api/projects/${projectId}`, { token: outsider.accessToken })).status).toBe(404)

    // Архивация и реактивация: только команда.
    const archived = await req<Json>('PATCH', `/api/projects/${projectId}/status`, { token: analyst.accessToken, body: { status: 'archived' } })
    expect(archived.status).toBe(200)
    expect(archived.data.status).toBe('archived')
    expect((await req('PATCH', `/api/projects/${projectId}/status`, { token: lead.accessToken, body: { status: 'active' } })).status).toBe(403)
    const reactivated = await req<Json>('PATCH', `/api/projects/${projectId}/status`, { token: manager.accessToken, body: { status: 'active' } })
    expect(reactivated.data.status).toBe('active')

    // Удаление участника: удалённый клиент теряет доступ (404).
    const leadMemberId = members.data.items.find((item: Json) => item.userId === lead.user.id).id
    expect((await req('DELETE', `/api/projects/${projectId}/members/${leadMemberId}`, { token: manager.accessToken })).status).toBe(204)
    expect((await req('GET', `/api/projects/${projectId}`, { token: lead.accessToken })).status).toBe(404)
    expect((await req('DELETE', `/api/projects/${projectId}/members/${leadMemberId}`, { token: manager.accessToken })).status).toBe(404)
    expect((await req('PATCH', `/api/projects/${projectId}/members/not-a-uuid`, { token: manager.accessToken, body: { role: 'observer' } })).status).toBe(400)
  })

  // ------------------------------------------------------------------
  // 8. Stages/Tasks
  // ------------------------------------------------------------------

  test('stages/tasks: CRUD, фильтры, doneAt, SetNull при удалении этапа, чужие ссылки 400', async () => {
    const analyst = await user('pl-analyst@ordiks.ru', { orgRole: 'analyst' })
    const manager = await user('pl-manager@ordiks.ru', { orgRole: 'manager' })
    const lead = await user('pl-lead@demo.ordiks.ru')
    const outsider = await user('pl-outsider@demo.ordiks.ru')
    const projectId = await project(analyst)
    await member(manager, projectId, lead.user.id, 'client_lead')
    const domainId = await firstDomainId(analyst, projectId)

    // Этапы поверх шаблонных.
    const stage = await req<Json>('POST', `/api/projects/${projectId}/stages`, {
      token: analyst.accessToken,
      body: { name: 'Анализ данных', milestone: true, startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-05T00:00:00.000Z' },
    })
    expect(stage.status).toBe(201)
    const stageId = stage.data.id as string
    const renamed = await req<Json>('PATCH', `/stages/${stageId}`, { token: analyst.accessToken, body: { name: 'Анализ и сводка', status: 'active' } })
    expect(renamed.status).toBe(200)
    expect(renamed.data.name).toBe('Анализ и сводка')
    expect(renamed.data.status).toBe('active')

    // Задача со связями.
    const task = await req<Json>('POST', `/api/projects/${projectId}/tasks`, {
      token: analyst.accessToken,
      body: { title: 'Свести простои', description: 'По трём цехам', stageId, domainId, assigneeId: analyst.user.id, deadline: '2026-10-10T00:00:00.000Z' },
    })
    expect(task.status).toBe(201)
    const taskId = task.data.id as string
    expect(task.data.stageId).toBe(stageId)

    // done проставляет doneAt, todo — снимает.
    const done = await req<Json>('PATCH', `/tasks/${taskId}`, { token: analyst.accessToken, body: { status: 'done' } })
    expect(done.data.doneAt).toBeTruthy()
    const reopened = await req<Json>('PATCH', `/tasks/${taskId}`, { token: analyst.accessToken, body: { status: 'todo' } })
    expect(reopened.data.doneAt).toBeNull()

    // Фильтры.
    const byStage = await req<Json>('GET', `/api/projects/${projectId}/tasks?stageId=${stageId}`, { token: analyst.accessToken })
    expect(byStage.data.items).toHaveLength(1)
    const byStatus = await req<Json>('GET', `/api/projects/${projectId}/tasks?status=done`, { token: analyst.accessToken })
    expect(byStatus.data.items).toHaveLength(0)
    const byAssignee = await req<Json>('GET', `/api/projects/${projectId}/tasks?assigneeId=${analyst.user.id}`, { token: analyst.accessToken })
    expect(byAssignee.data.items).toHaveLength(1)
    const byDomain = await req<Json>('GET', `/api/projects/${projectId}/tasks?domainId=${domainId}`, { token: analyst.accessToken })
    expect(byDomain.data.items).toHaveLength(1)

    // Клиент и посторонний не создают задачи; посторонний не видит список.
    expect((await req('POST', `/api/projects/${projectId}/tasks`, { token: lead.accessToken, body: { title: 'Нет' } })).status).toBe(403)
    expect((await req('GET', `/api/projects/${projectId}/tasks`, { token: outsider.accessToken })).status).toBe(404)

    // Чужой этап из другого проекта → 400; невалидный assigneeId → 400.
    const otherProjectId = await project(analyst, { name: 'Чужой этап' })
    const otherStage = await req<Json>('POST', `/api/projects/${otherProjectId}/stages`, { token: analyst.accessToken, body: { name: 'Чужой' } })
    expect((await req('POST', `/api/projects/${projectId}/tasks`, {
      token: analyst.accessToken,
      body: { title: 'Плохая связь', stageId: otherStage.data.id },
    })).status).toBe(400)
    expect((await req('POST', `/api/projects/${projectId}/tasks`, {
      token: analyst.accessToken,
      body: { title: 'Кривой исполнитель', assigneeId: 'not-a-uuid' },
    })).status).toBe(400)

    // Удаление этапа: задача остаётся со stageId=null (SetNull).
    expect((await req('DELETE', `/stages/${stageId}`, { token: analyst.accessToken })).status).toBe(204)
    const afterStageDelete = await req<Json>('GET', `/api/projects/${projectId}/tasks`, { token: analyst.accessToken })
    expect(afterStageDelete.data.items.find((item: Json) => item.id === taskId).stageId).toBeNull()

    // Удаление задачи: 204 и 404 после.
    expect((await req('DELETE', `/tasks/${taskId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('PATCH', `/tasks/${taskId}`, { token: analyst.accessToken, body: { title: 'Нет' } })).status).toBe(404)
    expect((await req('DELETE', `/stages/${stageId}`, { token: analyst.accessToken })).status).toBe(404)
  })

  // ------------------------------------------------------------------
  // 9. Domains + checklist auto-status
  // ------------------------------------------------------------------

  test('domains/checklist: группы, домены, авто-стус по чек-листу, ручной статус', async () => {
    const analyst = await user('dm-analyst@ordiks.ru', { orgRole: 'analyst' })
    const lead = await user('dm-lead@demo.ordiks.ru')
    const manager = await user('dm-manager@ordiks.ru', { orgRole: 'manager' })
    const projectId = await project(analyst)
    await member(manager, projectId, lead.user.id, 'client_lead')

    // Новая группа и домен.
    const group = await req<Json>('POST', `/api/projects/${projectId}/domain-groups`, { token: analyst.accessToken, body: { name: 'Логистика' } })
    expect(group.status).toBe(201)
    const groupId = group.data.id as string
    const renamedGroup = await req<Json>('PATCH', `/domain-groups/${groupId}`, { token: analyst.accessToken, body: { name: 'Логистика и склад' } })
    expect(renamedGroup.data.name).toBe('Логистика и склад')

    const domain = await req<Json>('POST', `/api/projects/${projectId}/domains`, {
      token: analyst.accessToken,
      body: { groupId, name: 'Склад', ownerId: analyst.user.id, checklist: ['Инвентаризация', 'Адресное хранение'] },
    })
    expect(domain.status).toBe(201)
    const domainId = domain.data.id as string

    // Клиент не создаёт домены.
    expect((await req('POST', `/api/projects/${projectId}/domains`, { token: lead.accessToken, body: { groupId, name: 'Нет' } })).status).toBe(403)

    // Чек-лист: автостатус not_started → in_progress → closed.
    let groups = await req<Json>('GET', `/api/projects/${projectId}/domain-groups`, { token: analyst.accessToken })
    let stored = groups.data.items.find((item: Json) => item.id === groupId).domains.find((d: Json) => d.id === domainId)
    expect(stored.status).toBe('not_started')
    const items = stored.checklist as Json[]
    expect(items.map((item: Json) => item.text)).toEqual(['Инвентаризация', 'Адресное хранение'])

    const firstItem = items[0]
    expect((await req('PATCH', `/checklist-items/${firstItem.id}`, { token: analyst.accessToken, body: { done: true } })).status).toBe(200)
    groups = await req<Json>('GET', `/api/projects/${projectId}/domain-groups`, { token: analyst.accessToken })
    stored = groups.data.items.find((item: Json) => item.id === groupId).domains.find((d: Json) => d.id === domainId)
    expect(stored.status).toBe('in_progress')

    for (const item of stored.checklist as Json[]) {
      await req('PATCH', `/checklist-items/${item.id}`, { token: analyst.accessToken, body: { done: true } })
    }
    groups = await req<Json>('GET', `/api/projects/${projectId}/domain-groups`, { token: analyst.accessToken })
    stored = groups.data.items.find((item: Json) => item.id === groupId).domains.find((d: Json) => d.id === domainId)
    expect(stored.status).toBe('closed')

    // Ручной статус сохраняется отдельно от чек-листа.
    const manual = await req<Json>('PATCH', `/domains/${domainId}`, { token: analyst.accessToken, body: { status: 'not_started' } })
    expect(manual.data.status).toBe('not_started')

    // Дозаявка пункта в чек-лист и его удаление.
    const extraItem = await req<Json>('POST', `/domains/${domainId}/checklist`, { token: analyst.accessToken, body: { text: 'Комплектация заказов' } })
    expect(extraItem.status).toBe(201)
    expect((await req('DELETE', `/checklist-items/${extraItem.data.id}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('DELETE', `/checklist-items/${extraItem.data.id}`, { token: analyst.accessToken })).status).toBe(404)

    // Перенос домена в другую группу + удаление домена и группы.
    const otherGroup = await req<Json>('POST', `/api/projects/${projectId}/domain-groups`, { token: analyst.accessToken, body: { name: 'Прочее' } })
    const moved = await req<Json>('PATCH', `/domains/${domainId}`, { token: analyst.accessToken, body: { groupId: otherGroup.data.id } })
    expect(moved.data.groupId).toBe(otherGroup.data.id)
    expect((await req('DELETE', `/domains/${domainId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('DELETE', `/domain-groups/${otherGroup.data.id}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('DELETE', `/domain-groups/${groupId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('PATCH', '/domains/not-a-uuid', { token: analyst.accessToken, body: { name: 'x' } })).status).toBe(400)
  })

  // ------------------------------------------------------------------
  // 10. Guides: дерево, дубль, showIf
  // ------------------------------------------------------------------

  test('guides: дерево с перевязкой showIf, секции/вопросы CRUD, дубль, негативные правила', async () => {
    const analyst = await user('gd-analyst@ordiks.ru', { orgRole: 'analyst' })
    const lead = await user('gd-lead@demo.ordiks.ru')
    const manager = await user('gd-manager@ordiks.ru', { orgRole: 'manager' })
    const projectId = await project(analyst)
    await member(manager, projectId, lead.user.id, 'client_lead')

    const guide = await req<Json>('POST', `/api/projects/${projectId}/guides`, {
      token: analyst.accessToken,
      body: {
        name: 'Опросник склада',
        sections: [
          {
            title: 'Процесс',
            questions: [
              { id: '11111111-1111-4111-8111-111111111111', type: 'yn', text: 'Есть WMS?', options: [] },
              { id: '22222222-2222-4222-8222-222222222222', type: 'text', text: 'Какая система?', options: [], showIfQuestionId: '11111111-1111-4111-8111-111111111111', showIfValue: 'yes' },
            ],
          },
        ],
      },
    })
    expect(guide.status).toBe(201)
    const guideId = guide.data.id as string
    const questions = guide.data.sections[0].questions
    // Перевязка showIf на серверный id вопроса-источника.
    expect(questions[1].showIfQuestionId).toBe(questions[0].id)
    expect(questions[1].showIfValue).toBe('yes')

    // Клиент гайды не создаёт.
    expect((await req('POST', `/api/projects/${projectId}/guides`, { token: lead.accessToken, body: { name: 'Нет' } })).status).toBe(403)

    // Дубль: новые id, showIf перевязан внутри копии.
    const copy = await req<Json>('POST', `/api/guides/${guideId}/duplicate`, { token: analyst.accessToken })
    expect(copy.status).toBe(201)
    const copyQuestions = copy.data.sections[0].questions
    expect(copy.data.id).not.toBe(guideId)
    expect(copyQuestions[0].id).not.toBe(questions[0].id)
    expect(copyQuestions[1].showIfQuestionId).toBe(copyQuestions[0].id)

    // Секции: добавить, переименовать (POST /sections возвращает дерево гайда — id ищем в нём).
    const sectionTree = await req<Json>('POST', `/api/guides/${guideId}/sections`, { token: analyst.accessToken, body: { title: 'Персонал' } })
    expect(sectionTree.status).toBe(201)
    const sectionId = (sectionTree.data.sections as Json[]).find((s: Json) => s.title === 'Персонал')!.id as string
    expect((await req('PATCH', `/guide-sections/${sectionId}`, { token: analyst.accessToken, body: { title: 'Персонал и смены' } })).status).toBe(200)
    const renamed = await req<Json>('GET', `/api/guides/${guideId}`, { token: analyst.accessToken })
    expect(renamed.data.sections.find((s: Json) => s.id === sectionId).title).toBe('Персонал и смены')

    // Вопрос: добавить (ответ — тоже дерево гайда).
    const questionTree = await req<Json>('POST', `/guide-sections/${sectionId}/questions`, {
      token: analyst.accessToken,
      body: { type: 'scale', text: 'Оцените загруженность', options: [] },
    })
    expect(questionTree.status).toBe(201)
    const questionId = (questionTree.data.sections as Json[])
      .flatMap((s: Json) => s.questions as Json[])
      .find((q: Json) => q.text === 'Оцените загруженность')!.id as string
    expect((await req('PATCH', `/guide-questions/${questionId}`, { token: analyst.accessToken, body: { text: 'Оцените загруженность смены' } })).status).toBe(200)

    // Негативные правила: choice без опций; условие без значения; условие на условный;
    // условие «вперёд источника» — на создании новый вопрос всегда последний в гайде, поэтому
    // правило проверяем правкой: первый вопрос не может зависеть от последующего.
    expect((await req('POST', `/guide-sections/${sectionId}/questions`, {
      token: analyst.accessToken,
      body: { type: 'choice', text: 'Выберите', options: [] },
    })).status).toBe(400)
    expect((await req('PATCH', `/guide-questions/${questions[0].id}`, {
      token: analyst.accessToken,
      body: { showIfQuestionId: questionId, showIfValue: '3' },
    })).status).toBe(400)
    expect((await req('POST', `/guide-sections/${sectionId}/questions`, {
      token: analyst.accessToken,
      body: { type: 'text', text: 'Без значения', options: [], showIfQuestionId: questions[0].id },
    })).status).toBe(400)
    expect((await req('POST', `/guide-sections/${sectionId}/questions`, {
      token: analyst.accessToken,
      body: { type: 'text', text: 'Цепочка', options: [], showIfQuestionId: questions[1].id, showIfValue: 'Да' },
    })).status).toBe(400)

    // Переименование гайда и удаления.
    expect((await req('PATCH', `/api/guides/${guideId}`, { token: analyst.accessToken, body: { name: 'Опросник склада v2' } })).status).toBe(200)
    expect((await req('DELETE', `/guide-questions/${questionId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('DELETE', `/guide-sections/${sectionId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('DELETE', `/api/guides/${copy.data.id}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('GET', `/api/guides/${copy.data.id}`, { token: analyst.accessToken })).status).toBe(404)

    // Список гайдов проекта и чтение клиентом.
    const list = await req<Json>('GET', `/api/projects/${projectId}/guides`, { token: lead.accessToken })
    expect(list.status).toBe(200)
    expect(list.data.items.map((item: Json) => item.id)).toEqual([guideId])

    // Удаление источника условия: зависимый вопрос остаётся без условия (SetNull).
    expect((await req('DELETE', `/guide-questions/${questions[0].id}`, { token: analyst.accessToken })).status).toBe(204)
    const afterSourceDelete = await req<Json>('GET', `/api/guides/${guideId}`, { token: analyst.accessToken })
    const dependent = afterSourceDelete.data.sections[0].questions.find((q: Json) => q.id === questions[1].id)
    expect(dependent.showIfQuestionId).toBeNull()
  })

  // ------------------------------------------------------------------
  // 11. Interviews + условные ответы
  // ------------------------------------------------------------------

  test('interviews: CRUD, save-батч с условной логикой и типами, фильтры', async () => {
    const analyst = await user('iv-analyst@ordiks.ru', { orgRole: 'analyst' })
    const lead = await user('iv-lead@demo.ordiks.ru')
    const manager = await user('iv-manager@ordiks.ru', { orgRole: 'manager' })
    const projectId = await project(analyst)
    await member(manager, projectId, lead.user.id, 'client_lead')
    const domainId = await firstDomainId(analyst, projectId)

    const guide = await req<Json>('POST', `/api/projects/${projectId}/guides`, {
      token: analyst.accessToken,
      body: {
        name: 'Гайд интервью',
        sections: [
          {
            title: 'Блок 1',
            questions: [
              { type: 'yn', text: 'Работает по регламенту?', options: [] },
              { type: 'text', text: 'Что вместо?', options: [], showIfQuestionId: undefined, showIfValue: undefined },
            ],
          },
        ],
      },
    })
    // Скорректируем условие через повторное создание (showIf задаётся сразу в дереве).
    const guide2 = await req<Json>('POST', `/api/projects/${projectId}/guides`, {
      token: analyst.accessToken,
      body: {
        name: 'Гайд с условием',
        sections: [
          {
            title: 'Блок',
            questions: [
              { type: 'yn', text: 'Есть регламент?', options: [] },
              { type: 'text', text: 'Опишите регламент', options: [], showIfQuestionId: (guide.data.sections[0].questions[0] as Json).id, showIfValue: 'never' },
            ],
          },
        ],
      },
    })
    expect(guide2.status).toBe(400) // условие ссылается на вопрос другого гайда
    void guide2

    // Правильное дерево: условие внутри одного создания (клиентские id).
    const goodGuide = await req<Json>('POST', `/api/projects/${projectId}/guides`, {
      token: analyst.accessToken,
      body: {
        name: 'Рабочий гайд',
        sections: [
          {
            title: 'Блок',
            questions: [
              { id: '33333333-3333-4333-8333-333333333333', type: 'yn', text: 'Есть регламент?', options: [] },
              { id: '44444444-4444-4444-8444-444444444444', type: 'text', text: 'Опишите регламент', options: [], showIfQuestionId: '33333333-3333-4333-8333-333333333333', showIfValue: 'no' },
              { type: 'scale', text: 'Оценка 1-5', options: [] },
              { type: 'multi', text: 'Какие цеха?', options: ['Цех 1', 'Цех 2'] },
            ],
          },
        ],
      },
    })
    expect(goodGuide.status).toBe(201)
    const guideId = goodGuide.data.id as string
    const qs = goodGuide.data.sections[0].questions as Json[]
    const [ynQ, condQ, scaleQ, multiQ] = qs

    // Интервью: создание, связи.
    const interview = await req<Json>('POST', `/api/projects/${projectId}/interviews`, {
      token: analyst.accessToken,
      body: { scheduledAt: '2026-10-06T09:00:00.000Z', respondent: 'Начальник склада', respondentRole: 'Склад', domainId, guideId },
    })
    expect(interview.status).toBe(201)
    const interviewId = interview.data.id as string
    expect(interview.data.answers).toEqual([])

    // Чужой домен/гайд → 400.
    const otherProjectId = await project(analyst, { name: 'Чужие связи' })
    const otherDomainId = await firstDomainId(analyst, otherProjectId)
    expect((await req('POST', `/api/projects/${projectId}/interviews`, {
      token: analyst.accessToken,
      body: { scheduledAt: '2026-10-06T09:00:00.000Z', respondent: 'X', domainId: otherDomainId },
    })).status).toBe(400)
    expect((await req('POST', `/api/projects/${projectId}/interviews`, {
      token: analyst.accessToken,
      body: { scheduledAt: '2026-10-06T09:00:00.000Z', respondent: 'X', guideId },
    })).status).toBe(201) // гайд свой — ок

    // Ответы: условный вопрос отвечен, но условие не выполнено → отброшен; типы нормализуются.
    const saved = await req<Json>('PUT', `/api/interviews/${interviewId}/answers`, {
      token: analyst.accessToken,
      body: {
        answers: [
          { questionId: ynQ.id, value: 'yes' },
          { questionId: condQ.id, value: 'Скрытый ответ' },
          { questionId: scaleQ.id, value: 4 },
          { questionId: multiQ.id, value: ['Цех 1', 'Цех 1', 'Цех 2'] },
        ],
      },
    })
    expect(saved.status).toBe(200)
    expect(saved.data.saved).toBe(3)
    const answers = saved.data.interview.answers as Json[]
    expect(answers.find((a: Json) => a.questionId === condQ.id)).toBeUndefined()
    expect(answers.find((a: Json) => a.questionId === multiQ.id)!.value).toEqual(['Цех 1', 'Цех 2'])

    // Условие выполнено → сохраняется.
    const resaved = await req<Json>('PUT', `/api/interviews/${interviewId}/answers`, {
      token: analyst.accessToken,
      body: {
        answers: [
          { questionId: ynQ.id, value: 'no' },
          { questionId: condQ.id, value: 'Регламента нет' },
        ],
      },
    })
    expect(resaved.data.saved).toBe(2)
    expect((resaved.data.interview.answers as Json[]).find((a: Json) => a.questionId === condQ.id)!.value).toBe('Регламента нет')

    // Неверные типы/значения → 400; вопрос из чужого гайда → 400; null не сохраняется.
    expect((await req('PUT', `/api/interviews/${interviewId}/answers`, {
      token: analyst.accessToken,
      body: { answers: [{ questionId: ynQ.id, value: 'maybe' }] },
    })).status).toBe(400)
    expect((await req('PUT', `/api/interviews/${interviewId}/answers`, {
      token: analyst.accessToken,
      body: { answers: [{ questionId: scaleQ.id, value: 9 }] },
    })).status).toBe(400)
    expect((await req('PUT', `/api/interviews/${interviewId}/answers`, {
      token: analyst.accessToken,
      body: { answers: [{ questionId: multiQ.id, value: ['Нет такого цеха'] }] },
    })).status).toBe(400)
    expect((await req('PUT', `/api/interviews/${interviewId}/answers`, {
      token: analyst.accessToken,
      body: { answers: [{ questionId: '00000000-0000-4000-8000-000000000005', value: 'x' }] },
    })).status).toBe(400)
    const nullBatch = await req<Json>('PUT', `/api/interviews/${interviewId}/answers`, {
      token: analyst.accessToken,
      body: { answers: [{ questionId: ynQ.id, value: null }] },
    })
    expect(nullBatch.data.saved).toBe(0)

    // Клиент не сохраняет ответы и не правит интервью.
    expect((await req('PUT', `/api/interviews/${interviewId}/answers`, {
      token: lead.accessToken,
      body: { answers: [{ questionId: ynQ.id, value: 'yes' }] },
    })).status).toBe(403)

    // Правка статуса, деталь, фильтр, удаление.
    const completed = await req<Json>('PATCH', `/api/interviews/${interviewId}`, {
      token: analyst.accessToken,
      body: { status: 'done', notes: 'Записано со слов' },
    })
    expect(completed.data.status).toBe('done')
    const doneList = await req<Json>('GET', `/api/projects/${projectId}/interviews?status=done`, { token: analyst.accessToken })
    expect(doneList.data.items).toHaveLength(1)
    const byDomain = await req<Json>('GET', `/api/projects/${projectId}/interviews?domainId=${domainId}`, { token: analyst.accessToken })
    expect(byDomain.data.items.length).toBeGreaterThanOrEqual(1)
    const detail = await req<Json>('GET', `/api/interviews/${interviewId}`, { token: lead.accessToken })
    expect(detail.status).toBe(200)
    expect((await req('DELETE', `/api/interviews/${interviewId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('GET', `/api/interviews/${interviewId}`, { token: analyst.accessToken })).status).toBe(404)
  })

  // ------------------------------------------------------------------
  // 12. Facts + файловый поток
  // ------------------------------------------------------------------

  test('facts: CRUD, фильтры, файл ticket→PUT→confirm→download→replace→delete', async () => {
    const analyst = await user('ft-analyst@ordiks.ru', { orgRole: 'analyst' })
    const lead = await user('ft-lead@demo.ordiks.ru')
    const manager = await user('ft-manager@ordiks.ru', { orgRole: 'manager' })
    const projectId = await project(analyst)
    await member(manager, projectId, lead.user.id, 'client_lead')
    const domainId = await firstDomainId(analyst, projectId)

    const fact = await req<Json>('POST', `/api/projects/${projectId}/facts`, {
      token: analyst.accessToken,
      body: { kind: 'file', title: 'Выгрузка 1С', description: 'Склад за сентябрь', shop: 'Цех 1', domainId, factDate: '2026-10-01T00:00:00.000Z' },
    })
    expect(fact.status).toBe(201)
    const factId = fact.data.id as string
    expect(fact.data.authorId).toBe(analyst.user.id)
    expect(fact.data.objectKey).toBeNull()

    // Клиент факты не создаёт.
    expect((await req('POST', `/api/projects/${projectId}/facts`, { token: lead.accessToken, body: { kind: 'note', title: 'Нет' } })).status).toBe(403)

    // Файловый поток.
    const bytes = Buffer.from('fact-file-bytes-2026', 'utf8')
    const ticket = await req<Json>('POST', `/api/facts/${factId}/file/upload-request`, {
      token: analyst.accessToken,
      body: { contentType: 'application/octet-stream', byteSize: bytes.byteLength },
    })
    expect(ticket.status).toBe(201)
    const upload = ticket.data.upload as Json
    expect((await app.request(upload.url as string, { method: 'PUT', headers: upload.headers as Record<string, string>, body: bytes })).status).toBe(200)

    const confirmed = await req<Json>('POST', `/api/facts/${factId}/file/confirm`, {
      token: analyst.accessToken,
      body: { token: upload.token, fileName: 'sklad-2026-09.csv' },
    })
    expect(confirmed.status).toBe(200)
    expect(confirmed.data.fileName).toBe('sklad-2026-09.csv')
    expect(confirmed.data.objectKey).toBeTruthy()

    // Скачивание: клиент_lead (view) получает подписанный URL.
    const download = await req<Json>('GET', `/api/facts/${factId}/file/download`, { token: lead.accessToken })
    expect(download.status).toBe(200)
    expect(download.data.url).toContain('/storage/objects/')

    // Подтверждение с мусорным токеном → 410 (тикет «истёк», как у аватаров).
    const wrongConfirm = await req('POST', `/api/facts/${factId}/file/confirm`, {
      token: analyst.accessToken,
      body: { token: 'x'.repeat(64), fileName: 'nope.csv' },
    })
    expect(wrongConfirm.status).toBe(410)

    const replacement = Buffer.from('replacement-bytes', 'utf8')
    const ticket2 = await req<Json>('POST', `/api/facts/${factId}/file/upload-request`, {
      token: analyst.accessToken,
      body: { contentType: 'text/plain', byteSize: replacement.byteLength },
    })
    expect((await app.request((ticket2.data.upload as Json).url as string, {
      method: 'PUT',
      headers: (ticket2.data.upload as Json).headers as Record<string, string>,
      body: replacement,
    })).status).toBe(200)
    const replaced = await req<Json>('POST', `/api/facts/${factId}/file/confirm`, {
      token: analyst.accessToken,
      body: { token: (ticket2.data.upload as Json).token, fileName: 'sklad-v2.csv' },
    })
    expect(replaced.data.fileName).toBe('sklad-v2.csv')

    // byteSize=0 → 400 (FACT_MIN_BYTES=1); кривой MIME → 400.
    expect((await req('POST', `/api/facts/${factId}/file/upload-request`, {
      token: analyst.accessToken,
      body: { contentType: 'text/plain', byteSize: 0 },
    })).status).toBe(400)
    expect((await req('POST', `/api/facts/${factId}/file/upload-request`, {
      token: analyst.accessToken,
      body: { contentType: 'not-a-mime', byteSize: 10 },
    })).status).toBe(400)

    // Отвязка файла, правка, фильтры, удаление.
    const unlinked = await req<Json>('DELETE', `/api/facts/${factId}/file`, { token: analyst.accessToken })
    expect(unlinked.status).toBe(200)
    expect(unlinked.data.objectKey).toBeNull()
    expect((await req('GET', `/api/facts/${factId}/file/download`, { token: analyst.accessToken })).status).toBe(404)

    const patched = await req<Json>('PATCH', `/api/facts/${factId}`, { token: analyst.accessToken, body: { title: 'Выгрузка 1С (доп)', shop: 'Цех 2' } })
    expect(patched.data.title).toBe('Выгрузка 1С (доп)')
    await req('POST', `/api/projects/${projectId}/facts`, { token: analyst.accessToken, body: { kind: 'note', title: 'Заметка на полях' } })
    await req('POST', `/api/projects/${projectId}/facts`, { token: analyst.accessToken, body: { kind: 'photo', title: 'Фото стеллажей' } })

    const byKind = await req<Json>('GET', `/api/projects/${projectId}/facts?kind=note`, { token: analyst.accessToken })
    expect(byKind.data.items).toHaveLength(1)
    const byShop = await req<Json>('GET', `/api/projects/${projectId}/facts?shop=${encodeURIComponent('Цех 2')}`, { token: analyst.accessToken })
    expect(byShop.data.items.map((item: Json) => item.title)).toEqual(['Выгрузка 1С (доп)'])
    const byQuery = await req<Json>('GET', `/api/projects/${projectId}/facts?q=стеллаж`, { token: analyst.accessToken })
    expect(byQuery.data.items).toHaveLength(1)

    // Посторонний не видит факт; клиент читает.
    const outsider = await user('ft-outsider@demo.ordiks.ru')
    expect((await req('GET', `/api/facts/${factId}`, { token: outsider.accessToken })).status).toBe(404)
    expect((await req('GET', `/api/facts/${factId}`, { token: lead.accessToken })).status).toBe(200)

    expect((await req('DELETE', `/api/facts/${factId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('GET', `/api/facts/${factId}`, { token: analyst.accessToken })).status).toBe(404)
  })

  // ------------------------------------------------------------------
  // 13. Requests: смена статуса клиентом, overdue
  // ------------------------------------------------------------------

  test('requests: CRUD, смена статуса client_lead, overdue-фильтр, права observer/outsider', async () => {
    const analyst = await user('rq-analyst@ordiks.ru', { orgRole: 'analyst' })
    const manager = await user('rq-manager@ordiks.ru', { orgRole: 'manager' })
    const lead = await user('rq-lead@demo.ordiks.ru')
    const staff = await user('rq-staff@demo.ordiks.ru')
    const observer = await user('rq-observer@demo.ordiks.ru')
    const outsider = await user('rq-outsider@demo.ordiks.ru')
    const projectId = await project(analyst)
    for (const [u, role] of [[lead, 'client_lead'], [staff, 'client_staff'], [observer, 'observer']] as const) {
      expect((await member(manager, projectId, u.user.id, role)).status).toBe(201)
    }
    const domainId = await firstDomainId(analyst, projectId)

    // Просроченный запрос (дедлайн в прошлом).
    const overdue = await req<Json>('POST', `/api/projects/${projectId}/requests`, {
      token: analyst.accessToken,
      body: { what: 'Реестр оборудования', why: 'Для анализа простоев', domainId, assigneeId: lead.user.id, deadline: '2026-01-01T00:00:00.000Z' },
    })
    expect(overdue.status).toBe(201)
    const overdueId = overdue.data.id as string
    expect(overdue.data.status).toBe('requested')
    expect(overdue.data.overdue).toBe(true)

    // Свежий запрос.
    const fresh = await req<Json>('POST', `/api/projects/${projectId}/requests`, {
      token: analyst.accessToken,
      body: { what: 'Фотографии стеллажей', deadline: '2099-01-01T00:00:00.000Z' },
    })
    expect(fresh.data.overdue).toBe(false)

    // Фильтры overdue/status/domain.
    const overdueList = await req<Json>('GET', `/api/projects/${projectId}/requests?overdue=true`, { token: analyst.accessToken })
    expect(overdueList.data.items.map((item: Json) => item.id)).toEqual([overdueId])
    const notOverdue = await req<Json>('GET', `/api/projects/${projectId}/requests?overdue=false`, { token: analyst.accessToken })
    expect(notOverdue.data.items.map((item: Json) => item.what)).toEqual(['Фотографии стеллажей'])
    const byDomain = await req<Json>('GET', `/api/projects/${projectId}/requests?domainId=${domainId}`, { token: analyst.accessToken })
    expect(byDomain.data.items).toHaveLength(1)

    // Клиент не создаёт/не правит/не удаляет — только статус.
    expect((await req('POST', `/api/projects/${projectId}/requests`, { token: lead.accessToken, body: { what: 'Нет' } })).status).toBe(403)
    expect((await req('PATCH', `/api/requests/${overdueId}`, { token: lead.accessToken, body: { what: 'Нет' } })).status).toBe(403)
    expect((await req('DELETE', `/api/requests/${overdueId}`, { token: lead.accessToken })).status).toBe(403)

    // client_lead/client_staff меняют статус: in_progress → received (receivedAt).
    const inProgress = await req<Json>('PATCH', `/api/requests/${overdueId}/status`, { token: lead.accessToken, body: { status: 'in_progress' } })
    expect(inProgress.status).toBe(200)
    expect(inProgress.data.status).toBe('in_progress')
    const received = await req<Json>('PATCH', `/api/requests/${overdueId}/status`, { token: staff.accessToken, body: { status: 'received' } })
    expect(received.data.status).toBe('received')
    expect(received.data.receivedAt).toBeTruthy()
    expect(received.data.overdue).toBe(false)

    // observer не меняет статус; посторонний — 404.
    expect((await req('PATCH', `/api/requests/${fresh.data.id}/status`, { token: observer.accessToken, body: { status: 'received' } })).status).toBe(403)
    expect((await req('PATCH', `/api/requests/${fresh.data.id}/status`, { token: outsider.accessToken, body: { status: 'received' } })).status).toBe(404)
    expect((await req('GET', `/api/projects/${projectId}/requests`, { token: outsider.accessToken })).status).toBe(404)

    // Команда правит, читает единичный запрос и удаляет.
    const patched = await req<Json>('PATCH', `/api/requests/${fresh.data.id}`, { token: analyst.accessToken, body: { what: 'Фото стеллажей и рамп' } })
    expect(patched.data.what).toBe('Фото стеллажей и рамп')
    const single = await req<Json>('GET', `/api/requests/${fresh.data.id}`, { token: lead.accessToken })
    expect(single.status).toBe(200)
    expect(single.data.what).toBe('Фото стеллажей и рамп')
    expect((await req('GET', `/api/requests/${fresh.data.id}`, { token: outsider.accessToken })).status).toBe(404)
    expect((await req('DELETE', `/api/requests/${fresh.data.id}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('PATCH', `/api/requests/${fresh.data.id}/status`, { token: lead.accessToken, body: { status: 'received' } })).status).toBe(404)
  })

  // ------------------------------------------------------------------
  // 14. Findings + bulk + лимиты
  // ------------------------------------------------------------------

  test('findings: CRUD, bulk, фильтры, лимит 501 id → 400, связи с фактом', async () => {
    const analyst = await user('fn-analyst@ordiks.ru', { orgRole: 'analyst' })
    const manager = await user('fn-manager@ordiks.ru', { orgRole: 'manager' })
    const lead = await user('fn-lead@demo.ordiks.ru')
    const outsider = await user('fn-outsider@demo.ordiks.ru')
    const projectId = await project(analyst)
    await member(manager, projectId, lead.user.id, 'client_lead')
    const domainId = await firstDomainId(analyst, projectId)
    const fact = await req<Json>('POST', `/api/projects/${projectId}/facts`, { token: analyst.accessToken, body: { kind: 'note', title: 'Осмотр' } })

    const finding = await req<Json>('POST', `/api/projects/${projectId}/findings`, {
      token: analyst.accessToken,
      body: { title: 'План в Excel', priority: 'Критично', category: 'Процесс', domainId, factId: fact.data.id, ownerId: analyst.user.id },
    })
    expect(finding.status).toBe(201)
    expect(finding.data.status).toBeTruthy()
    const findingId = finding.data.id as string

    const second = await req<Json>('POST', `/api/projects/${projectId}/findings`, {
      token: analyst.accessToken,
      body: { title: 'Нет регламента', priority: 'Высокий', status: 'confirmed', domainId },
    })

    // Клиент не создаёт и не правит; посторонний 404.
    expect((await req('POST', `/api/projects/${projectId}/findings`, { token: lead.accessToken, body: { title: 'Нет' } })).status).toBe(403)
    expect((await req('PATCH', `/api/findings/${findingId}`, { token: lead.accessToken, body: { title: 'Нет' } })).status).toBe(403)
    expect((await req('GET', `/api/projects/${projectId}/findings`, { token: outsider.accessToken })).status).toBe(404)

    // Фильтры: domain/priority/status.
    const byDomain = await req<Json>('GET', `/api/projects/${projectId}/findings?domainId=${domainId}`, { token: lead.accessToken })
    expect(byDomain.data.items).toHaveLength(2)
    const byPriority = await req<Json>('GET', `/api/projects/${projectId}/findings?priority=${encodeURIComponent('Критично')}`, { token: analyst.accessToken })
    expect(byPriority.data.items.map((item: Json) => item.title)).toEqual(['План в Excel'])
    const byStatus = await req<Json>('GET', `/api/projects/${projectId}/findings?status=confirmed`, { token: analyst.accessToken })
    expect(byStatus.data.items.map((item: Json) => item.title)).toEqual(['Нет регламента'])

    // Правка + bulk смена статуса.
    const patched = await req<Json>('PATCH', `/api/findings/${findingId}`, { token: analyst.accessToken, body: { title: 'План в Excel и почте', priority: 'Средний' } })
    expect(patched.data.title).toBe('План в Excel и почте')
    const bulk = await req<Json>('POST', `/api/projects/${projectId}/findings/bulk`, {
      token: analyst.accessToken,
      body: { ids: [findingId, second.data.id], status: 'confirmed' },
    })
    expect(bulk.status).toBe(200)
    expect(bulk.data.updated).toBe(2)

    // Лимит: 501 id → 400; пустой массив → 400.
    const tooMany = Array.from({ length: 501 }, () => findingId)
    expect((await req('POST', `/api/projects/${projectId}/findings/bulk`, {
      token: analyst.accessToken,
      body: { ids: tooMany, status: 'confirmed' },
    })).status).toBe(400)
    expect((await req('POST', `/api/projects/${projectId}/findings/bulk`, {
      token: analyst.accessToken,
      body: { ids: [], status: 'confirmed' },
    })).status).toBe(400)

    // Удаление факта отвязывает находку (SetNull).
    expect((await req('DELETE', `/api/facts/${fact.data.id}`, { token: analyst.accessToken })).status).toBe(204)
    const orphan = await req<Json>('GET', `/api/findings/${findingId}`, { token: analyst.accessToken })
    expect(orphan.data.factId).toBeNull()

    expect((await req('DELETE', `/api/findings/${findingId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('GET', `/api/findings/${findingId}`, { token: analyst.accessToken })).status).toBe(404)
  })

  // ------------------------------------------------------------------
  // 15. Processes: CRUD + шаги + mapTo + reorder + схемы
  // ------------------------------------------------------------------

  test('processes: процессы, шаги asis/tobe, mapTo/disappears, reorder, схемы, удаление', async () => {
    const analyst = await user('pc-analyst@ordiks.ru', { orgRole: 'analyst' })
    const manager = await user('pc-manager@ordiks.ru', { orgRole: 'manager' })
    const lead = await user('pc-lead@demo.ordiks.ru')
    const outsider = await user('pc-outsider@demo.ordiks.ru')
    const projectId = await project(analyst)
    await member(manager, projectId, lead.user.id, 'client_lead')

    const created = await req<Json>('POST', `/api/projects/${projectId}/processes`, { token: analyst.accessToken, body: { name: 'Заказ клиента' } })
    expect(created.status).toBe(201)
    const processId = created.data.id as string
    expect(created.data.steps).toEqual([])
    expect(created.data.schemes).toEqual([])
    expect((await req('GET', `/api/projects/${projectId}/processes`, { token: lead.accessToken })).status).toBe(200)

    const renamed = await req<Json>('PATCH', `/api/processes/${processId}`, { token: analyst.accessToken, body: { name: 'Путь заказа' } })
    expect(renamed.data.name).toBe('Путь заказа')

    // Клиент не правит процессы.
    expect((await req('PATCH', `/api/processes/${processId}`, { token: lead.accessToken, body: { name: 'Нет' } })).status).toBe(403)

    // TO-BE шаги.
    const tb1 = await req<Json>('POST', `/api/processes/${processId}/steps`, {
      token: analyst.accessToken,
      body: { side: 'tobe', title: 'Заказ в CRM', actorRole: 'Менеджер', tools: ['CRM'], effect: 'Один источник' },
    })
    const tb2 = await req<Json>('POST', `/api/processes/${processId}/steps`, {
      token: analyst.accessToken,
      body: { side: 'tobe', title: 'Авто-накладная', actorRole: 'Система' },
    })
    const tb1Id = (tb1.data.steps as Json[]).at(-1)!.id as string
    const tb2Id = (tb2.data.steps as Json[]).at(-1)!.id as string

    // AS-IS с mapTo; исчезающий шаг.
    const asis = await req<Json>('POST', `/api/processes/${processId}/steps`, {
      token: analyst.accessToken,
      body: { side: 'asis', title: 'Заказ в почте', actorRole: 'Менеджер', tools: ['Почта'], mapToStepId: tb1Id },
    })
    expect((asis.data.steps as Json[]).find((step: Json) => step.side === 'asis')!.mapToStepId).toBe(tb1Id)
    const vanish = await req<Json>('POST', `/api/processes/${processId}/steps`, {
      token: analyst.accessToken,
      body: { side: 'asis', title: 'Звонок диспетчеру', disappears: true },
    })
    expect((vanish.data.steps as Json[]).find((step: Json) => step.disappears)!.mapToStepId).toBeNull()

    // mapTo на tobe → 400; disappears+mapTo → 400.
    expect((await req('POST', `/api/processes/${processId}/steps`, {
      token: analyst.accessToken,
      body: { side: 'tobe', title: 'X', mapToStepId: tb1Id },
    })).status).toBe(400)
    expect((await req('POST', `/api/processes/${processId}/steps`, {
      token: analyst.accessToken,
      body: { side: 'asis', title: 'Y', mapToStepId: tb1Id, disappears: true },
    })).status).toBe(400)

    // Правка шага и reorder.
    expect((await req('PATCH', `/api/process-steps/${tb2Id}`, { token: analyst.accessToken, body: { title: 'Авто-накладная и маршрут' } })).status).toBe(200)
    const reordered = await req<Json>('POST', `/api/processes/${processId}/steps/reorder`, {
      token: analyst.accessToken,
      body: { side: 'tobe', ids: [tb2Id, tb1Id] },
    })
    expect((reordered.data.steps as Json[]).filter((step: Json) => step.side === 'tobe').map((step: Json) => step.title))
      .toEqual(['Авто-накладная и маршрут', 'Заказ в CRM'])
    // Неполный список → 400.
    expect((await req('POST', `/api/processes/${processId}/steps/reorder`, {
      token: analyst.accessToken,
      body: { side: 'tobe', ids: [tb1Id] },
    })).status).toBe(400)
    // Лимит 501 → 400.
    expect((await req('POST', `/api/processes/${processId}/steps/reorder`, {
      token: analyst.accessToken,
      body: { side: 'tobe', ids: [...Array.from({ length: 501 }, () => tb1Id)] },
    })).status).toBe(400)

    // Схема: тикет → PUT → confirm → download; замена; удаление.
    const bytes = png()
    const ticket = await req<Json>('POST', `/api/processes/${processId}/schemes/asis/upload-request`, {
      token: analyst.accessToken,
      body: { contentType: 'image/png', byteSize: bytes.byteLength },
    })
    expect(ticket.status).toBe(201)
    expect(ticket.data.upload.url).toContain(`/projects/${projectId}/processes/${processId}/asis/`)
    expect((await app.request((ticket.data.upload as Json).url as string, {
      method: 'PUT',
      headers: (ticket.data.upload as Json).headers as Record<string, string>,
      body: bytes,
    })).status).toBe(200)
    const confirmed = await req<Json>('POST', `/api/processes/${processId}/schemes/asis/confirm`, {
      token: analyst.accessToken,
      body: { token: (ticket.data.upload as Json).token, fileName: 'asis.png' },
    })
    expect(confirmed.status).toBe(200)
    expect((confirmed.data.schemes as Json[])[0]).toMatchObject({ side: 'asis', fileName: 'asis.png' })

    const download = await req<Json>('GET', `/api/processes/${processId}/schemes/asis/download`, { token: lead.accessToken })
    expect(download.status).toBe(200)
    expect(download.data.url).toContain('/storage/objects/')
    expect((await req('GET', `/api/processes/${processId}/schemes/tobe/download`, { token: analyst.accessToken })).status).toBe(404)
    expect((await req('GET', `/api/processes/${processId}/schemes/asis/download`, { token: outsider.accessToken })).status).toBe(404)

    // Неразрешённый MIME → 400.
    expect((await req('POST', `/api/processes/${processId}/schemes/asis/upload-request`, {
      token: analyst.accessToken,
      body: { contentType: 'application/pdf', byteSize: 10 },
    })).status).toBe(400)

    const schemeRemoved = await req<Json>('DELETE', `/api/processes/${processId}/schemes/asis`, { token: analyst.accessToken })
    expect(schemeRemoved.status).toBe(200)
    expect(schemeRemoved.data.schemes).toEqual([])

    // Удаление шага и процесса.
    expect((await req('DELETE', `/api/process-steps/${tb1Id}`, { token: analyst.accessToken })).status).toBe(204)
    const afterStepDelete = await req<Json>('GET', `/api/processes/${processId}`, { token: analyst.accessToken })
    expect((afterStepDelete.data.steps as Json[]).find((step: Json) => step.side === 'asis' && step.title === 'Заказ в почте')!.mapToStepId).toBeNull()
    expect((await req('DELETE', `/api/processes/${processId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('GET', `/api/processes/${processId}`, { token: analyst.accessToken })).status).toBe(404)
    expect((await req('GET', `/api/processes/${processId}`, { token: outsider.accessToken })).status).toBe(404)
  })

  // ------------------------------------------------------------------
  // 16. Report: разделы, вставки всех видов, визы
  // ------------------------------------------------------------------

  test('report: разделы CRUD, вставки findings/risks/requests/coverage/registry, визы, готовность', async () => {
    const analyst = await user('rp-analyst@ordiks.ru', { orgRole: 'analyst' })
    const manager = await user('rp-manager@ordiks.ru', { orgRole: 'manager' })
    const lead = await user('rp-lead@demo.ordiks.ru')
    const staff = await user('rp-staff@demo.ordiks.ru')
    const observer = await user('rp-observer@demo.ordiks.ru')
    const projectId = await project(analyst)
    for (const [u, role] of [[lead, 'client_lead'], [staff, 'client_staff'], [observer, 'observer']] as const) {
      expect((await member(manager, projectId, u.user.id, role)).status).toBe(201)
    }
    const domainId = await firstDomainId(analyst, projectId)

    // Пустой отчёт.
    const empty = await req<Json>('GET', `/api/projects/${projectId}/report`, { token: analyst.accessToken })
    expect(empty.status).toBe(200)
    expect(empty.data.sections).toEqual([])

    // Данные для вставок.
    await req('POST', `/api/projects/${projectId}/findings`, {
      token: analyst.accessToken,
      body: { title: 'План в трёх местах', priority: 'Критично', domainId, status: 'confirmed' },
    })
    await req('POST', `/api/projects/${projectId}/risks`, {
      token: analyst.accessToken,
      body: { title: 'Срыв данных', probability: 4, impact: 3 },
    })
    await req('POST', `/api/projects/${projectId}/requests`, {
      token: analyst.accessToken,
      body: { what: 'Реестр станков', deadline: '2099-01-01T00:00:00.000Z' },
    })
    const registry = await req<Json>('POST', `/api/projects/${projectId}/registries`, {
      token: analyst.accessToken,
      body: { name: 'Простои' },
    })
    await req('POST', `/api/registries/${registry.data.id}/fields`, { token: analyst.accessToken, body: { key: 'mins', name: 'Минут', type: 'number' } })
    await req('POST', `/api/registries/${registry.data.id}/entries`, { token: analyst.accessToken, body: { values: { mins: 30 } } })

    const section = await req<Json>('POST', `/api/projects/${projectId}/report/sections`, {
      token: analyst.accessToken,
      body: { title: '1. Диагностика', body: '<p>Текст</p>' },
    })
    expect(section.status).toBe(201)
    const sectionId = section.data.id as string

    // Клиент разделы не создаёт и не правит.
    expect((await req('POST', `/api/projects/${projectId}/report/sections`, { token: lead.accessToken, body: { title: 'Нет' } })).status).toBe(403)
    expect((await req('PATCH', `/api/report-sections/${sectionId}`, { token: lead.accessToken, body: { title: 'Нет' } })).status).toBe(403)

    // Вставки всех пяти видов.
    for (const [kind, extra] of [
      ['findings', { domainId }],
      ['risks', {}],
      ['requests', {}],
      ['coverage', {}],
      ['registry', { registryId: registry.data.id }],
    ] as const) {
      const inserted = await req<Json>('POST', `/api/projects/${projectId}/report/insert`, {
        token: analyst.accessToken,
        body: { sectionId, kind, ...extra },
      })
      expect(inserted.status).toBe(200)
      expect((inserted.data.section.body as string).length).toBeGreaterThan(0)
    }
    // registry без registryId → 400; findings без domainId → 400.
    expect((await req('POST', `/api/projects/${projectId}/report/insert`, {
      token: analyst.accessToken,
      body: { sectionId, kind: 'registry' },
    })).status).toBe(400)
    expect((await req('POST', `/api/projects/${projectId}/report/insert`, {
      token: analyst.accessToken,
      body: { sectionId, kind: 'findings' },
    })).status).toBe(400)

    // Визы: lead/staff визируют, observer нет, команда не визирует? (команда может — но по产品 только клиенты; проверяем клиента и observer).
    const approved = await req<Json>('PUT', `/api/report-sections/${sectionId}/approval`, {
      token: lead.accessToken,
      body: { decision: 'approved', comment: 'Ок' },
    })
    expect(approved.status).toBe(200)
    expect((await req('PUT', `/api/report-sections/${sectionId}/approval`, {
      token: staff.accessToken,
      body: { decision: 'changes', comment: 'Дополнить' },
    })).status).toBe(200)
    expect((await req('PUT', `/api/report-sections/${sectionId}/approval`, {
      token: observer.accessToken,
      body: { decision: 'approved' },
    })).status).toBe(403)

    // Повторная виза перезаписывается.
    await req('PUT', `/api/report-sections/${sectionId}/approval`, { token: staff.accessToken, body: { decision: 'approved' } })
    const withVisas = await req<Json>('GET', `/api/report-sections/${sectionId}`, { token: analyst.accessToken })
    expect(withVisas.data.approvals).toHaveLength(2)

    // Готовность.
    const report = await req<Json>('GET', `/api/projects/${projectId}/report`, { token: analyst.accessToken })
    expect(report.data.readiness).toMatchObject({ sections: 1, agreed: 1 })

    // Правка содержимого сбрасывает визы.
    await req('PATCH', `/api/report-sections/${sectionId}`, { token: analyst.accessToken, body: { body: '<p>Обновлено</p>' } })
    const afterEdit = await req<Json>('GET', `/api/report-sections/${sectionId}`, { token: analyst.accessToken })
    expect(afterEdit.data.approvals).toEqual([])

    expect((await req('DELETE', `/api/report-sections/${sectionId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('GET', `/api/report-sections/${sectionId}`, { token: analyst.accessToken })).status).toBe(404)
  })

  // ------------------------------------------------------------------
  // 17. Comments + notifications
  // ------------------------------------------------------------------

  test('comments: треды, права автора/команды, observer только читает; notifications + read', async () => {
    const analyst = await user('cm-analyst@ordiks.ru', { orgRole: 'analyst' })
    const manager = await user('cm-manager@ordiks.ru', { orgRole: 'manager' })
    const lead = await user('cm-lead@demo.ordiks.ru')
    const observer = await user('cm-observer@demo.ordiks.ru')
    const outsider = await user('cm-outsider@demo.ordiks.ru')
    const projectId = await project(analyst)
    for (const [u, role] of [[lead, 'client_lead'], [observer, 'observer']] as const) {
      expect((await member(manager, projectId, u.user.id, role)).status).toBe(201)
    }
    const finding = await req<Json>('POST', `/api/projects/${projectId}/findings`, {
      token: analyst.accessToken,
      body: { title: 'Нет маркировки' },
    })

    // client_lead комментирует с needsAnswer; команда отвечает.
    const first = await req<Json>('POST', `/api/projects/${projectId}/comments`, {
      token: lead.accessToken,
      body: { threadType: 'finding', threadId: finding.data.id, body: 'Когда исправим?', needsAnswer: true },
    })
    expect(first.status).toBe(201)
    const second = await req<Json>('POST', `/api/projects/${projectId}/comments`, {
      token: analyst.accessToken,
      body: { threadType: 'finding', threadId: finding.data.id, body: 'В следующем спринте' },
    })

    // observer не пишет.
    expect((await req('POST', `/api/projects/${projectId}/comments`, {
      token: observer.accessToken,
      body: { threadType: 'finding', threadId: finding.data.id, body: 'Никак' },
    })).status).toBe(403)

    // Тред: ascending, observer читает.
    const thread = await req<Json>('GET', `/api/projects/${projectId}/comments?threadType=finding&threadId=${finding.data.id}`, {
      token: observer.accessToken,
    })
    expect(thread.data.items).toHaveLength(2)
    expect(thread.data.items.map((item: Json) => item.needsAnswer)).toEqual([true, false])

    // Чужой объект треда (несуществующий id) → 400; чужой проект → 404.
    expect((await req('POST', `/api/projects/${projectId}/comments`, {
      token: analyst.accessToken,
      body: { threadType: 'finding', threadId: '00000000-0000-4000-8000-000000000006', body: 'Пусто' },
    })).status).toBe(400)
    expect((await req('POST', `/api/projects/${projectId}/comments`, {
      token: outsider.accessToken,
      body: { threadType: 'finding', threadId: finding.data.id, body: 'Чужой' },
    })).status).toBe(404)

    // Правка: автор свою, команда чужую, второй клиент чужую — нет (здесь staff нет, проверим observer → 403).
    expect((await req('PATCH', `/api/comments/${first.data.id}`, { token: lead.accessToken, body: { body: 'Когда исправим? (уточнено)' } })).status).toBe(200)
    expect((await req('PATCH', `/api/comments/${first.data.id}`, { token: analyst.accessToken, body: { body: 'Правка команды' } })).status).toBe(200)
    expect((await req('PATCH', `/api/comments/${second.data.id}`, { token: observer.accessToken, body: { body: 'Нет' } })).status).toBe(403)

    // Уведомления: только свой проект; read гасит; unreadComments в списке проектов.
    const notifications = await req<Json>('GET', '/api/me/notifications', { token: lead.accessToken })
    expect(notifications.data.items.length).toBeGreaterThan(0)
    expect(notifications.data.items.every((item: Json) => item.project.id === projectId)).toBe(true)
    const outsiderNotifications = await req<Json>('GET', '/api/me/notifications', { token: outsider.accessToken })
    expect(outsiderNotifications.data).toEqual({ items: [] })

    const before = await req<Json>('GET', '/api/projects', { token: lead.accessToken })
    expect(before.data.items.find((item: Json) => item.id === projectId).unreadComments).toBeGreaterThan(0)
    expect((await req('POST', '/api/me/notifications/read', {
      token: lead.accessToken,
      body: { threadType: 'finding', threadId: finding.data.id },
    })).status).toBe(204)
    const after = await req<Json>('GET', '/api/projects', { token: lead.accessToken })
    expect(after.data.items.find((item: Json) => item.id === projectId).unreadComments).toBe(0)

    // Удаление: автор или команда; после удаления тред пуст.
    expect((await req('DELETE', `/api/comments/${second.data.id}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('PATCH', `/api/comments/${second.data.id}`, { token: analyst.accessToken, body: { body: 'x' } })).status).toBe(404)
    const emptied = await req<Json>('GET', `/api/projects/${projectId}/comments?threadType=finding&threadId=${finding.data.id}`, {
      token: lead.accessToken,
    })
    expect(emptied.data.items).toHaveLength(1)
  })

  // ------------------------------------------------------------------
  // 18. Analytics: все семь журналов
  // ------------------------------------------------------------------

  test('analytics: gaps/risks/requirements/decisions/communications/quick-wins/baselines CRUD + фильтры', async () => {
    const analyst = await user('an-analyst@ordiks.ru', { orgRole: 'analyst' })
    const manager = await user('an-manager@ordiks.ru', { orgRole: 'manager' })
    const lead = await user('an-lead@demo.ordiks.ru')
    const outsider = await user('an-outsider@demo.ordiks.ru')
    const projectId = await project(analyst)
    await member(manager, projectId, lead.user.id, 'client_lead')
    const domainId = await firstDomainId(analyst, projectId)
    const finding = await req<Json>('POST', `/api/projects/${projectId}/findings`, {
      token: analyst.accessToken,
      body: { title: 'Учёт оснастки' },
    })

    // Клиент не создаёт ни один журнал.
    for (const [path, body] of [
      ['/gaps', { requirement: 'Нет' }],
      ['/risks', { title: 'Нет' }],
      ['/requirements', { title: 'Нет' }],
      ['/decisions', { title: 'Нет' }],
      ['/communications', { title: 'Нет' }],
      ['/quick-wins', { title: 'Нет' }],
      ['/baselines', { metric: 'Нет', value: '1' }],
    ] as const) {
      expect((await req('POST', `/api/projects/${projectId}${path}`, { token: lead.accessToken, body: { ...(body as Json) } })).status).toBe(403)
    }

    // GAP со связью на находку и домен.
    const gap = await req<Json>('POST', `/api/projects/${projectId}/gaps`, {
      token: analyst.accessToken,
      body: { requirement: 'Прогноз ресурса форм', kind: 'dev', findingId: finding.data.id, domainId },
    })
    expect(gap.status).toBe(201)
    const gapPatched = await req<Json>('PATCH', `/api/gaps/${gap.data.id}`, { token: analyst.accessToken, body: { status: 'agreed', comment: 'Закрыто доработкой' } })
    expect(gapPatched.data.status).toBe('agreed')

    // Чужая находка → 400.
    const otherProjectId = await project(analyst, { name: 'Чужой аналитический' })
    const otherFinding = await req<Json>('POST', `/api/projects/${otherProjectId}/findings`, { token: analyst.accessToken, body: { title: 'Чужая' } })
    expect((await req('POST', `/api/projects/${projectId}/gaps`, {
      token: analyst.accessToken,
      body: { requirement: 'Плохо', findingId: otherFinding.data.id },
    })).status).toBe(400)

    // Риски: критичность и фильтры.
    const risk = await req<Json>('POST', `/api/projects/${projectId}/risks`, {
      token: analyst.accessToken,
      body: { title: 'Отказ формы', probability: 3, impact: 5, domainId, ownerId: lead.user.id, mitigation: 'Запас форм' },
    })
    expect(risk.data.criticality).toBe(15)
    await req('POST', `/api/projects/${projectId}/risks`, { token: analyst.accessToken, body: { title: 'Срыв данных', probability: 4, impact: 3, status: 'mitigated' } })
    const risksByStatus = await req<Json>('GET', `/api/projects/${projectId}/risks?status=mitigated`, { token: analyst.accessToken })
    expect(risksByStatus.data.items.map((item: Json) => item.title)).toEqual(['Срыв данных'])
    const risksByDomain = await req<Json>('GET', `/api/projects/${projectId}/risks?domainId=${domainId}`, { token: lead.accessToken })
    expect(risksByDomain.data.items).toHaveLength(1)
    expect((await req('PATCH', `/api/risks/${risk.data.id}`, { token: analyst.accessToken, body: { status: 'closed' } })).status).toBe(200)

    // Требования MoSCoW + фильтр.
    await req('POST', `/api/projects/${projectId}/requirements`, { token: analyst.accessToken, body: { title: 'Статус заказа онлайн', moscow: 'must', domainId, findingId: finding.data.id } })
    await req('POST', `/api/projects/${projectId}/requirements`, { token: analyst.accessToken, body: { title: 'Интеграция с банком', moscow: 'wont' } })
    const musts = await req<Json>('GET', `/api/projects/${projectId}/requirements?moscow=must`, { token: analyst.accessToken })
    expect(musts.data.items.map((item: Json) => item.title)).toEqual(['Статус заказа онлайн'])

    // Решения: активное → superseded.
    const decision = await req<Json>('POST', `/api/projects/${projectId}/decisions`, {
      token: analyst.accessToken,
      body: { title: 'Пилот на складе', rationale: 'Явные потери', participants: 'Иван, Анна', decidedAt: '2026-10-02T00:00:00.000Z' },
    })
    expect(decision.data.status).toBe('active')
    expect((await req('PATCH', `/api/decisions/${decision.data.id}`, { token: analyst.accessToken, body: { status: 'superseded' } })).status).toBe(200)

    // Коммуникации.
    const communication = await req<Json>('POST', `/api/projects/${projectId}/communications`, {
      token: analyst.accessToken,
      body: { title: 'Стартовая планёрка', kind: 'meeting', participants: 'Иван', summary: 'Согласовали план', heldAt: '2026-10-01T10:00:00.000Z' },
    })
    expect(communication.data.kind).toBe('meeting')
    expect((await req('PATCH', `/api/communications/${communication.data.id}`, { token: analyst.accessToken, body: { summary: 'План согласован' } })).status).toBe(200)

    // Quick wins.
    const quickWin = await req<Json>('POST', `/api/projects/${projectId}/quick-wins`, {
      token: analyst.accessToken,
      body: { title: 'Ярлыки на склад', effect: 'Меньше поиска', effort: 'низкий', domainId },
    })
    expect(quickWin.data.status).toBe('suggested')
    expect((await req('PATCH', `/api/quick-wins/${quickWin.data.id}`, { token: analyst.accessToken, body: { status: 'done' } })).status).toBe(200)

    // Базлайны.
    const baseline = await req<Json>('POST', `/api/projects/${projectId}/baselines`, {
      token: analyst.accessToken,
      body: { metric: 'Сборка заказа', value: '45', unit: 'мин', source: 'хронометраж' },
    })
    expect((await req('PATCH', `/api/baselines/${baseline.data.id}`, { token: analyst.accessToken, body: { value: '47' } })).status).toBe(200)

    // GET единичных записей: команда и клиент читают, посторонний 404.
    const paths = [
      `/api/gaps/${gap.data.id}`,
      `/api/risks/${risk.data.id}`,
      `/api/requirements/${musts.data.items[0].id}`,
      `/api/decisions/${decision.data.id}`,
      `/api/communications/${communication.data.id}`,
      `/api/quick-wins/${quickWin.data.id}`,
      `/api/baselines/${baseline.data.id}`,
    ]
    for (const path of paths) {
      expect((await req('GET', path, { token: lead.accessToken })).status).toBe(200)
      expect((await req('GET', path, { token: outsider.accessToken })).status).toBe(404)
      expect((await req('DELETE', path, { token: lead.accessToken })).status).toBe(403)
    }
    // Удаление командой.
    for (const path of paths) {
      expect((await req('DELETE', path, { token: analyst.accessToken })).status).toBe(204)
    }
  })

  // ------------------------------------------------------------------
  // 19. Custom registries: конструктор + записи + bulk + import + формулы
  // ------------------------------------------------------------------

  test('registries: реестр/поля/статусы/записи CRUD, формулы, bulk, импорт, перенос статуса', async () => {
    const analyst = await user('rg-analyst@ordiks.ru', { orgRole: 'analyst' })
    const manager = await user('rg-manager@ordiks.ru', { orgRole: 'manager' })
    const observer = await user('rg-observer@demo.ordiks.ru')
    const projectId = await project(analyst)
    await member(manager, projectId, observer.user.id, 'observer')

    const registry = await req<Json>('POST', `/api/projects/${projectId}/registries`, {
      token: analyst.accessToken,
      body: { name: 'Оснастка', description: 'Ресурс форм' },
    })
    expect(registry.status).toBe(201)
    const registryId = registry.data.id as string
    expect((await req('PATCH', `/api/registries/${registryId}`, { token: analyst.accessToken, body: { name: 'Оснастка и инструмент' } })).status).toBe(200)

    // Наблюдатель не создаёт реестры.
    expect((await req('POST', `/api/projects/${projectId}/registries`, { token: observer.accessToken, body: { name: 'Нет' } })).status).toBe(403)

    // Поля: number ×2, формула вычитания, select. POST /fields возвращает дерево реестра.
    await req('POST', `/api/registries/${registryId}/fields`, { token: analyst.accessToken, body: { key: 'total', name: 'Всего', type: 'number' } })
    const workedTree = await req<Json>('POST', `/api/registries/${registryId}/fields`, { token: analyst.accessToken, body: { key: 'worked', name: 'Наработка', type: 'number' } })
    const workedFieldId = (workedTree.data.fields as Json[]).find((field: Json) => field.key === 'worked')!.id as string
    const formula = await req<Json>('POST', `/api/registries/${registryId}/fields`, {
      token: analyst.accessToken,
      body: { key: 'left', name: 'Остаток', type: 'formula', formula: { op: '-', a: { type: 'field', key: 'total' }, b: { type: 'field', key: 'worked' } } },
    })
    expect(formula.status).toBe(201)
    const selectTree = await req<Json>('POST', `/api/registries/${registryId}/fields`, {
      token: analyst.accessToken,
      body: { key: 'state', name: 'Состояние', type: 'select', options: ['Годна', 'Ремонт'] },
    })
    // Дубль ключа → 400; формула на не-числовое поле → 400.
    expect((await req('POST', `/api/registries/${registryId}/fields`, { token: analyst.accessToken, body: { key: 'total', name: 'Дубль', type: 'number' } })).status).toBe(400)
    expect((await req('POST', `/api/registries/${registryId}/fields`, {
      token: analyst.accessToken,
      body: { key: 'bad', name: 'Плохая', type: 'formula', formula: { op: '-', a: { type: 'field', key: 'state' }, b: { type: 'const', value: 1 } } },
    })).status).toBe(400)
    // Правка поля: переименование; select-опции.
    expect((await req('PATCH', `/api/registry-fields/${workedFieldId}`, { token: analyst.accessToken, body: { name: 'Наработка циклов' } })).status).toBe(200)
    void selectTree

    // Статусы (POST /statuses тоже возвращает дерево).
    const inWorkTree = await req<Json>('POST', `/api/registries/${registryId}/statuses`, { token: analyst.accessToken, body: { name: 'В работе', color: 'blue' } })
    const inWorkId = (inWorkTree.data.statuses as Json[]).find((status: Json) => status.name === 'В работе')!.id as string
    const repairTree = await req<Json>('POST', `/api/registries/${registryId}/statuses`, { token: analyst.accessToken, body: { name: 'В ремонте', color: 'amber' } })
    const repairId = (repairTree.data.statuses as Json[]).find((status: Json) => status.name === 'В ремонте')!.id as string
    expect((await req('PATCH', `/api/registry-statuses/${repairId}`, { token: analyst.accessToken, body: { color: 'red' } })).status).toBe(200)

    // Записи: computed формулы; formula-ключ в values → 400; неверный тип → 400.
    const entry = await req<Json>('POST', `/api/registries/${registryId}/entries`, {
      token: analyst.accessToken,
      body: { values: { total: 12000, worked: 7700 }, statusId: inWorkId },
    })
    expect(entry.status).toBe(201)
    expect(entry.data.computed).toEqual({ left: 4300 })
    expect((await req('POST', `/api/registries/${registryId}/entries`, { token: analyst.accessToken, body: { values: { left: 1 } } })).status).toBe(400)
    expect((await req('POST', `/api/registries/${registryId}/entries`, { token: analyst.accessToken, body: { values: { total: 'много' } } })).status).toBe(400)

    // Правка записи (полная замена values) и статуса.
    const updatedEntry = await req<Json>('PATCH', `/api/registry-entries/${entry.data.id}`, {
      token: analyst.accessToken,
      body: { values: { total: 10000, worked: 2000 }, statusId: repairId },
    })
    expect(updatedEntry.data.computed.left).toBe(8000)

    // Импорт: таб-разделитель, маппинг по ключам, кривые строки пропущены.
    await req('POST', `/api/registries/${registryId}/fields`, { token: analyst.accessToken, body: { key: 'number', name: 'Номер', type: 'text' } })
    const importText = ['Номер\tВсего\tНаработка\tСтатус', 'Ф-201\t12000\t900\tВ работе', 'М-31\t8000\t7190\tв ремонте', 'Ф-202\tмного\t50\tВ работе']
      .join('\n')
    const imported = await req<Json>('POST', `/api/registries/${registryId}/import`, {
      token: analyst.accessToken,
      body: { text: importText, hasHeader: true, mapping: { 0: 'number', 1: 'total', 2: 'worked', 3: 'status' }, statusId: inWorkId },
    })
    expect(imported.status).toBe(200)
    expect(imported.data.created).toBe(2)
    expect(imported.data.skipped).toHaveLength(1)
    expect(imported.data.defaultStatus).toBe(0)

    // Поиск и фильтр; наблюдатель читает.
    const all = await req<Json>('GET', `/api/registries/${registryId}/entries`, { token: observer.accessToken })
    expect(all.data.items).toHaveLength(3)
    const found = await req<Json>('GET', `/api/registries/${registryId}/entries?q=Ф-201`, { token: analyst.accessToken })
    expect(found.data.items).toHaveLength(1)
    const byStatus = await req<Json>('GET', `/api/registries/${registryId}/entries?statusId=${repairId}`, { token: analyst.accessToken })
    expect(byStatus.data.items.length).toBeGreaterThanOrEqual(1)

    // Bulk: смена статуса, лимит 501 → 400, удаление.
    const bulk = await req<Json>('POST', `/api/registries/${registryId}/entries/bulk-status`, {
      token: analyst.accessToken,
      body: { ids: [entry.data.id, found.data.items[0].id], statusId: repairId },
    })
    expect(bulk.data.updated).toBe(2)
    expect((await req('POST', `/api/registries/${registryId}/entries/bulk-status`, {
      token: analyst.accessToken,
      body: { ids: Array.from({ length: 501 }, () => entry.data.id), statusId: repairId },
    })).status).toBe(400)
    const deleted = await req<Json>('POST', `/api/registries/${registryId}/entries/bulk-delete`, {
      token: analyst.accessToken,
      body: { ids: [found.data.items[0].id] },
    })
    expect(deleted.data.deleted).toBe(1)

    // Удаление поля чистит values; удаление статуса переносит записи.
    expect((await req('DELETE', `/api/registry-fields/${workedFieldId}`, { token: analyst.accessToken })).status).toBe(204)
    const afterFieldDelete = await req<Json>('GET', `/api/registries/${registryId}/entries`, { token: analyst.accessToken })
    for (const item of afterFieldDelete.data.items as Json[]) {
      expect('worked' in item.values).toBe(false)
      expect(item.computed.left).toBeNull()
    }
    const moved = await req<Json>('DELETE', `/api/registry-statuses/${repairId}`, { token: analyst.accessToken })
    expect(moved.data.movedCount).toBeGreaterThanOrEqual(2)
    expect(moved.data.movedTo).toBe(inWorkId)

    // Удаление записи и реестра.
    expect((await req('DELETE', `/api/registry-entries/${entry.data.id}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('DELETE', `/api/registries/${registryId}`, { token: analyst.accessToken })).status).toBe(204)
    expect((await req('GET', `/api/registries/${registryId}`, { token: analyst.accessToken })).status).toBe(404)
  })

  // ------------------------------------------------------------------
  // 20. Templates: библиотека + from-template + to-template
  // ------------------------------------------------------------------

  test('templates: CRUD права, from-template разворачивает, to-template снимает, round-trip', async () => {
    const owner = await user('tp-owner@ordiks.ru', { orgRole: 'owner' })
    const analyst = await user('tp-analyst@ordiks.ru', { orgRole: 'analyst' })
    const client = await user('tp-client@demo.ordiks.ru')

    // Клиент библиотеку не видит; аналитик читает, но не пишет.
    expect((await req('GET', '/api/project-templates', { token: client.accessToken })).status).toBe(403)
    expect((await req('GET', '/api/project-templates', { token: analyst.accessToken })).status).toBe(200)
    expect((await req('POST', '/api/project-templates', { token: analyst.accessToken, body: { name: 'Нет', payload: {} } })).status).toBe(403)

    const payload = {
      stageNames: ['Диагностика', 'Отчёт'],
      weeks: 2,
      groups: ['Диагностика'],
      domains: [{ groupIndex: 0, name: 'Продажи', checklist: ['Путь заказа'] }],
      reportSections: ['1. Сводка'],
      guides: [
        {
          name: 'Опросник',
          sections: [
            {
              title: 'Процесс',
              questions: [
                { clientRefId: 'q1', type: 'yn', text: 'CRM есть?', options: [] },
                { clientRefId: 'q2', type: 'text', text: 'Какая?', options: [], showIfClientRefId: 'q1', showIfValue: 'yes' },
              ],
            },
          ],
        },
      ],
      dictionaries: {
        findingCategories: ['Процесс'],
        findingPriorities: ['Высокий'],
        findingStatuses: [],
        factTypes: [],
        passportFields: [{ id: 'pf-1', name: 'Численность', type: 'number' }],
      },
      registries: [
        {
          name: 'Простои',
          description: '',
          fields: [
            { key: 'minutes', name: 'Минут', type: 'number', options: [] },
            { key: 'hours', name: 'Часов', type: 'formula', options: [], formula: { op: '*', a: { type: 'field', key: 'minutes' }, b: { type: 'const', value: 1 / 60 } } },
          ],
          statuses: [{ name: 'Открыт', color: 'red' }],
        },
      ],
      fromProject: null,
    }
    const created = await req<Json>('POST', '/api/project-templates', {
      token: owner.accessToken,
      body: { name: 'Экспресс', description: 'Быстрый аудит', payload },
    })
    expect(created.status).toBe(201)

    // Правка и переименование шаблона.
    expect((await req('PATCH', `/api/project-templates/${created.data.id}`, { token: owner.accessToken, body: { name: 'Экспресс 2.0' } })).status).toBe(200)

    // Разворачивание.
    const deployed = await req<Json>('POST', '/api/projects/from-template', {
      token: analyst.accessToken,
      body: { templateId: created.data.id, name: 'Экспресс, Пермь', client: 'ООО «Пермь»', city: 'Пермь', shops: ['Цех 1'] },
    })
    expect(deployed.status).toBe(201)
    const projectId = deployed.data.id as string
    expect(deployed.data.settings.passportFields).toEqual([{ id: 'pf-1', name: 'Численность', type: 'number' }])

    const guides = await req<Json>('GET', `/api/projects/${projectId}/guides`, { token: analyst.accessToken })
    const questions = (guides.data.items[0].sections[0].questions as Json[])
    expect(questions[1].showIfQuestionId).toBe(questions[0].id)

    const registries = await req<Json>('GET', `/api/projects/${projectId}/registries`, { token: analyst.accessToken })
    expect((registries.data.items[0].fields as Json[]).map((field: Json) => field.key)).toEqual(['minutes', 'hours'])

    const report = await req<Json>('GET', `/api/projects/${projectId}/report`, { token: analyst.accessToken })
    expect((report.data.sections as Json[]).map((section: Json) => section.title)).toEqual(['1. Сводка'])

    // Снимок: записи не копируются, showIfClientRefId = id источника.
    await req('POST', `/api/registries/${registries.data.items[0].id}/entries`, { token: analyst.accessToken, body: { values: { minutes: 30 } } })
    const snapshot = await req<Json>('POST', `/api/projects/${projectId}/to-template`, {
      token: owner.accessToken,
      body: { name: 'Снимок Экспресса', description: 'Из проекта' },
    })
    expect(snapshot.status).toBe(201)
    expect(snapshot.data.payload.fromProject).toBe('Экспресс, Пермь')
    const snapshotGuide = snapshot.data.payload.guides[0].sections[0].questions
    expect(snapshotGuide[1].showIfClientRefId).toBe(snapshotGuide[0].clientRefId)

    // Round-trip: снимок разворачивается.
    const roundTrip = await req<Json>('POST', '/api/projects/from-template', {
      token: owner.accessToken,
      body: { templateId: snapshot.data.id, name: 'Экспресс, круг' },
    })
    expect(roundTrip.status).toBe(201)

    // from_template с несуществующим шаблоном → 404; невалидный UUID → 400.
    expect((await req('POST', '/api/projects/from-template', {
      token: owner.accessToken,
      body: { templateId: '00000000-0000-4000-8000-000000000007', name: 'Пусто' },
    })).status).toBe(404)
    expect((await req('POST', '/api/projects/from-template', {
      token: owner.accessToken,
      body: { templateId: 'nope', name: 'Пусто' },
    })).status).toBe(400)

    // Удаление шаблона.
    expect((await req('DELETE', `/api/project-templates/${created.data.id}`, { token: owner.accessToken })).status).toBe(204)
    expect((await req('GET', '/api/project-templates', { token: owner.accessToken })).status).toBe(200)
  })

  // ------------------------------------------------------------------
  // 21. Пустой проект + матрица прав одним прогоном
  // ------------------------------------------------------------------

  test('empty project: все списки пустые; матрица прав observer/client_lead/outsider', async () => {
    const analyst = await user('em-analyst@ordiks.ru', { orgRole: 'analyst' })
    const manager = await user('em-manager@ordiks.ru', { orgRole: 'manager' })
    const lead = await user('em-lead@demo.ordiks.ru')
    const observer = await user('em-observer@demo.ordiks.ru')
    const outsider = await user('em-outsider@demo.ordiks.ru')

    // Проект без шаблона.
    const created = await req<Json>('POST', '/api/projects', {
      token: analyst.accessToken,
      body: { name: 'Пустой проект', client: 'ООО «Пусто»' },
    })
    const projectId = created.data.id as string
    for (const [u, role] of [[lead, 'client_lead'], [observer, 'observer']] as const) {
      expect((await member(manager, projectId, u.user.id, role)).status).toBe(201)
    }

    const emptyLists = [
      '/stages', '/tasks', '/domain-groups', '/guides', '/interviews', '/facts',
      '/findings', '/requests', '/processes', '/registries', '/gaps', '/risks',
      '/requirements', '/decisions', '/communications', '/quick-wins', '/baselines',
    ]
    for (const suffix of emptyLists) {
      const { status, data } = await req<Json>('GET', `/api/projects/${projectId}${suffix}`, { token: observer.accessToken })
      expect(status).toBe(200)
      expect(data.items).toEqual([])
    }
    // Члены не пусты: создатель + две клиентские роли.
    const members = await req<Json>('GET', `/api/projects/${projectId}/members`, { token: observer.accessToken })
    expect(members.data.items.length).toBe(3)
    const report = await req<Json>('GET', `/api/projects/${projectId}/report`, { token: observer.accessToken })
    expect(report.data.sections).toEqual([])
    const notifications = await req<Json>('GET', '/api/me/notifications', { token: observer.accessToken })
    expect(notifications.data).toEqual({ items: [] })

    // Матрица прав: observer — только чтение.
    const writeAttempts: Array<[string, string, Record<string, unknown>]> = [
      ['POST', `/api/projects/${projectId}/findings`, { title: 'Нет' }],
      ['POST', `/api/projects/${projectId}/facts`, { kind: 'note', title: 'Нет' }],
      ['POST', `/api/projects/${projectId}/requests`, { what: 'Нет' }],
      ['POST', `/api/projects/${projectId}/guides`, { name: 'Нет' }],
      ['POST', `/api/projects/${projectId}/interviews`, { scheduledAt: '2026-10-06T09:00:00.000Z', respondent: 'X' }],
      ['POST', `/api/projects/${projectId}/processes`, { name: 'Нет' }],
      ['POST', `/api/projects/${projectId}/report/sections`, { title: 'Нет' }],
      ['POST', `/api/projects/${projectId}/comments`, { threadType: 'finding', threadId: '00000000-0000-4000-8000-000000000008', body: 'Нет' }],
      ['POST', `/api/projects/${projectId}/stages`, { name: 'Нет' }],
      ['POST', `/api/projects/${projectId}/tasks`, { title: 'Нет' }],
      ['POST', `/api/projects/${projectId}/registries`, { name: 'Нет' }],
      ['POST', `/api/projects/${projectId}/risks`, { title: 'Нет' }],
      ['PATCH', `/api/projects/${projectId}`, { goals: 'Нет' }],
    ]
    for (const [method, path, body] of writeAttempts) {
      expect((await req(method, path, { token: observer.accessToken, body })).status).toBe(403)
    }

    // client_lead: те же записи запрещены (кроме комментариев и смены статуса запроса — они в тестах 13/17).
    for (const [method, path, body] of writeAttempts.filter(([, p]) => !p.endsWith('/comments'))) {
      expect((await req(method, path, { token: lead.accessToken, body })).status).toBe(403)
    }

    // Клиент без членства: 404 на всё (чтение и запись; тело минимально валидно, чтобы 404 решал guard).
    const suffixBodies: Record<string, Record<string, unknown>> = {
      '/findings': { title: 'x' },
      '/facts': { kind: 'note', title: 'x' },
      '/requests': { what: 'x' },
      '/stages': { name: 'x' },
    }
    for (const [suffix, body] of Object.entries(suffixBodies)) {
      expect((await req('GET', `/api/projects/${projectId}${suffix}`, { token: outsider.accessToken })).status).toBe(404)
      expect((await req('POST', `/api/projects/${projectId}${suffix}`, { token: outsider.accessToken, body })).status).toBe(404)
    }
    expect((await req('GET', `/api/projects/${projectId}`, { token: outsider.accessToken })).status).toBe(404)
  })

  // ------------------------------------------------------------------
  // 22. Каскады SetNull при удалении домена
  // ------------------------------------------------------------------

  test('SetNull: удаление домена обнуляет связи задач/находок/GAP/фактов/интервью', async () => {
    const analyst = await user('sn-analyst@ordiks.ru', { orgRole: 'analyst' })
    const projectId = await project(analyst)
    const domainId = await firstDomainId(analyst, projectId)

    const guide = await req<Json>('POST', `/api/projects/${projectId}/guides`, {
      token: analyst.accessToken,
      body: { name: 'Гайд', sections: [{ title: 'Блок', questions: [{ type: 'text', text: 'Вопрос' }] }] },
    })
    const fact = await req<Json>('POST', `/api/projects/${projectId}/facts`, { token: analyst.accessToken, body: { kind: 'note', title: 'Факт', domainId } })
    const finding = await req<Json>('POST', `/api/projects/${projectId}/findings`, { token: analyst.accessToken, body: { title: 'Находка', domainId } })
    const gap = await req<Json>('POST', `/api/projects/${projectId}/gaps`, { token: analyst.accessToken, body: { requirement: 'Разрыв', domainId } })
    const task = await req<Json>('POST', `/api/projects/${projectId}/tasks`, { token: analyst.accessToken, body: { title: 'Задача', domainId } })
    const interview = await req<Json>('POST', `/api/projects/${projectId}/interviews`, {
      token: analyst.accessToken,
      body: { scheduledAt: '2026-10-06T09:00:00.000Z', respondent: 'X', domainId, guideId: guide.data.id },
    })

    expect((await req('DELETE', `/api/domains/${domainId}`, { token: analyst.accessToken })).status).toBe(204)

    expect((await req<Json>('GET', `/api/facts/${fact.data.id}`, { token: analyst.accessToken })).data.domainId).toBeNull()
    expect((await req<Json>('GET', `/api/findings/${finding.data.id}`, { token: analyst.accessToken })).data.domainId).toBeNull()
    expect((await req<Json>('GET', `/api/gaps/${gap.data.id}`, { token: analyst.accessToken })).data.domainId).toBeNull()
    // У задачи нет одиночного GET: проверяем через список проекта.
    const tasks = await req<Json>('GET', `/api/projects/${projectId}/tasks`, { token: analyst.accessToken })
    expect((tasks.data.items as Json[]).find((item: Json) => item.id === task.data.id)!.domainId).toBeNull()
    expect((await req<Json>('GET', `/api/interviews/${interview.data.id}`, { token: analyst.accessToken })).data.domainId).toBeNull()
  })
})
