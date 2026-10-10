import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../../app'
import { createPrisma, type DbClient } from '../../db'
import { loadEnv } from '../../env'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

type Session = { accessToken: string; user: { id: string; email: string } }
type App = ReturnType<typeof createApp>

const inviteCodePattern = /^[0-9A-Z]{5}-[0-9A-Z]{5}$/

describe('invites API integration', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: 'http://localhost:5173',
    ACCESS_TOKEN_TTL_SECONDS: '60',
  })
  const prisma = createPrisma(databaseUrl)
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.invite.deleteMany()
    await prisma.project.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.passwordResetToken.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('only owners and managers issue invites; only owners can grant the owner role', async () => {
    const analyst = await registerAs(prisma, app, 'inv-analyst@ordiks.ru', 'analyst')
    const manager = await registerAs(prisma, app, 'inv-manager@ordiks.ru', 'manager')
    const owner = await registerAs(prisma, app, 'inv-owner@ordiks.ru', 'owner')

    expect((await app.request('/api/invites', {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ orgRole: 'analyst' }),
    })).status).toBe(403)
    expect((await app.request('/api/invites', { headers: authHeaders(analyst.accessToken) })).status).toBe(403)

    const ownerInvite = await app.request('/api/invites', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ orgRole: 'owner' }),
    })
    expect(ownerInvite.status).toBe(403)

    expect((await app.request('/api/invites', {
      method: 'POST',
      headers: jsonHeaders(owner.accessToken),
      body: JSON.stringify({ orgRole: 'owner', note: 'второй владелец' }),
    })).status).toBe(201)

    const list = await app.request('/api/invites', { headers: authHeaders(manager.accessToken) })
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({
      items: [expect.objectContaining({ orgRole: 'owner', active: true, note: 'второй владелец' })],
    })
  })

  test('accept creates the account, the membership, and burns the code exactly once', async () => {
    const manager = await registerAs(prisma, app, 'acc-manager@ordiks.ru', 'manager')
    const owner = await registerAs(prisma, app, 'acc-owner@ordiks.ru', 'owner')

    const projectResponse = await app.request('/api/projects', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ name: 'ЖБИ-завод, Уфа' }),
    })
    const projectId = (await projectResponse.json()).id

    const inviteResponse = await app.request('/api/invites', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ orgRole: 'client', projectId, memberRole: 'client_lead', note: 'директор заказчика' }),
    })
    expect(inviteResponse.status).toBe(201)
    const invite = await inviteResponse.json()
    expect(invite.code).toMatch(inviteCodePattern)
    expect(invite).toMatchObject({ projectId, memberRole: 'client_lead', active: true, usedById: null })

    const accept = await app.request('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: invite.code,
        email: 'rustem@demo.ordiks.ru',
        password: 'password123',
        displayName: 'Рустем Гареев',
      }),
    })
    expect(accept.status).toBe(201)
    const accepted = await accept.json()
    expect(accepted).toMatchObject({
      email: 'rustem@demo.ordiks.ru',
      orgRole: 'client',
      projectId,
      memberRole: 'client_lead',
    })

    // Аккаунт создан с ролью клиента и членством руководителя заказчика; вход работает сразу.
    const created = await prisma.user.findUniqueOrThrow({ where: { email: 'rustem@demo.ordiks.ru' } })
    expect(created).toMatchObject({ orgRole: 'client', displayName: 'Рустем Гареев', passwordHash: expect.any(String) })
    expect(
      await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: created.id } },
        select: { role: true },
      }),
    ).toEqual({ role: 'client_lead' })

    const login = await app.request('/api/auth/token/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rustem@demo.ordiks.ru', password: 'password123' }),
    })
    expect(login.status).toBe(200)
    const loginBody = await login.json()
    expect(loginBody.user).toMatchObject({ orgRole: 'client' })

    // Проект виден новому клиенту — и только он.
    const clientList = await app.request('/api/projects', { headers: authHeaders(loginBody.accessToken) })
    expect(await clientList.json()).toMatchObject({
      items: [{ id: projectId, access: { view: true, comment: true, edit: false } }],
    })

    // Код сгорает: второй accept тем же кодом невозможен, инвайт помечен использованным.
    const reuse = await app.request('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: invite.code, email: 'other@demo.ordiks.ru', password: 'password123' }),
    })
    expect(reuse.status).toBe(400)
    expect((await reuse.json()).error.code).toBe('INVITE_INVALID')
    const burned = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id } })
    expect(burned).toMatchObject({ usedById: created.id, usedAt: expect.any(Date) })

    const listAfter = await (await app.request('/api/invites', { headers: authHeaders(owner.accessToken) })).json()
    expect(listAfter.items[0]).toMatchObject({ active: false })

    // Занятый email — конфликт даже с новым кодом.
    const secondInvite = await (await app.request('/api/invites', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ orgRole: 'client', projectId, memberRole: 'observer' }),
    })).json()
    const takenEmail = await app.request('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: secondInvite.code, email: 'rustem@demo.ordiks.ru', password: 'password123' }),
    })
    expect(takenEmail.status).toBe(409)
    // Неудачный accept не сжигает код: пользователь так и не создан.
    expect(await prisma.user.count({ where: { email: 'rustem@demo.ordiks.ru' } })).toBe(1)
    expect((await prisma.invite.findUniqueOrThrow({ where: { id: secondInvite.id } })).usedById).toBeNull()
  })

  test('expired and deactivated codes are rejected; a team invite grants the org role', async () => {
    const manager = await registerAs(prisma, app, 'team-manager@ordiks.ru', 'manager')

    const expired = await (await app.request('/api/invites', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ orgRole: 'client', expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    })).json()
    const expiredAccept = await app.request('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: expired.code, email: 'late@demo.ordiks.ru', password: 'password123' }),
    })
    expect(expiredAccept.status).toBe(400)
    expect((await expiredAccept.json()).error.code).toBe('INVITE_INVALID')

    const deactivated = await (await app.request('/api/invites', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ orgRole: 'client' }),
    })).json()
    const deactivate = await app.request(`/api/invites/${deactivated.id}`, {
      method: 'DELETE',
      headers: authHeaders(manager.accessToken),
    })
    expect(deactivate.status).toBe(200)
    expect(await deactivate.json()).toMatchObject({ active: false })
    const deactivatedAccept = await app.request('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: deactivated.code, email: 'late@demo.ordiks.ru', password: 'password123' }),
    })
    expect(deactivatedAccept.status).toBe(400)

    expect((await app.request('/api/invites/00000000-0000-7000-8000-00000000000b', {
      method: 'DELETE',
      headers: authHeaders(manager.accessToken),
    })).status).toBe(404)

    // Инвайт в команду: аккаунт сразу получает orgRole analyst и доступ ко всем проектам.
    const projectId = await (await (await app.request('/api/projects', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ name: 'Чужой проект' }),
    })).json()).id
    const teamInvite = await (await app.request('/api/invites', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ orgRole: 'analyst' }),
    })).json()
    const teamAccept = await app.request('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: teamInvite.code, email: 'new-analyst@ordiks.ru', password: 'password123' }),
    })
    expect(teamAccept.status).toBe(201)
    expect(await teamAccept.json()).toMatchObject({ orgRole: 'analyst', projectId: null, memberRole: null })

    const teamLogin = await (await app.request('/api/auth/token/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new-analyst@ordiks.ru', password: 'password123' }),
    })).json()
    const teamList = await app.request('/api/projects', { headers: authHeaders(teamLogin.accessToken) })
    expect(await teamList.json()).toMatchObject({
      items: [{ id: projectId, access: { view: true, comment: true, edit: true } }],
    })

    // Инвайт с projectId без memberRole не проходит валидацию контракта.
    expect((await app.request('/api/invites', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ orgRole: 'client', projectId }),
    })).status).toBe(400)

    // Инвайт на несуществующий проект — 404.
    expect((await app.request('/api/invites', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ orgRole: 'client', projectId: '00000000-0000-7000-8000-00000000000c', memberRole: 'client_staff' }),
    })).status).toBe(404)
  })
})

async function registerAs(
  prisma: DbClient,
  app: App,
  email: string,
  orgRole: 'owner' | 'manager' | 'analyst' | 'client',
): Promise<Session> {
  const response = await app.request('/api/auth/token/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  })
  expect(response.status).toBe(201)
  const session = await response.json()
  await prisma.user.update({ where: { id: session.user.id }, data: { orgRole } })
  return session
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

function jsonHeaders(accessToken: string) {
  return { ...authHeaders(accessToken), 'Content-Type': 'application/json' }
}
