import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import type { DomainStatus } from '@ordiks-survey/contracts'

import { createApp } from '../../app'
import { createPrisma, type DbClient } from '../../db'
import { loadEnv } from '../../env'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

const template = {
  stageNames: ['Подготовка', 'Выезд и сбор фактов'],
  weeks: 2,
  groups: ['Продажи и заказы', 'Производство'],
  domains: [
    { groupIndex: 0, name: 'Продажи и договоры', checklist: ['Как формируется заказ', 'Договор'] },
    { groupIndex: 1, name: 'Диспетчеризация' },
  ],
}

type Session = { accessToken: string; user: { id: string; email: string } }
type App = ReturnType<typeof createApp>

describe('projects API integration', () => {
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

  test('team sees and edits every project; a client sees only membership and cannot edit', async () => {
    const analyst = await registerAs(prisma, app, 'analyst@ordiks.ru', 'analyst')
    const owner = await registerAs(prisma, app, 'owner@ordiks.ru', 'owner')
    const manager = await registerAs(prisma, app, 'manager@ordiks.ru', 'manager')
    const client = await registerAs(prisma, app, 'client@demo.ordiks.ru', 'client')

    const projectId = await createProject(app, analyst, { project: { name: 'ЖБИ-завод, Уфа', client: 'ООО «Завод ЖБИ»', city: 'Уфа' } })

    // Команда видит проект с полным доступом, даже не будучи его создателем.
    const ownerList = await app.request('/api/projects', { headers: authHeaders(owner.accessToken) })
    expect(ownerList.status).toBe(200)
    expect(await ownerList.json()).toMatchObject({
      items: [{ id: projectId, access: { view: true, comment: true, edit: true } }],
    })

    // Клиент без членства не видит проекта; 404 не выдаёт существование.
    const emptyList = await app.request('/api/projects', { headers: authHeaders(client.accessToken) })
    expect(await emptyList.json()).toEqual({ items: [] })
    expect((await app.request(`/api/projects/${projectId}`, { headers: authHeaders(client.accessToken) })).status).toBe(404)

    // Клиент не может создать проект или править чужой.
    expect((await app.request('/api/projects', {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ name: 'Свой проект' }),
    })).status).toBe(403)

    // Менеджер добавляет клиента руководителем заказчика и наблюдателя.
    expect((await addMember(app, manager, projectId, client.user.id, 'client_lead')).status).toBe(201)
    const observer = await registerAs(prisma, app, 'observer@demo.ordiks.ru', 'client')
    expect((await addMember(app, manager, projectId, observer.user.id, 'observer')).status).toBe(201)

    const clientList = await app.request('/api/projects', { headers: authHeaders(client.accessToken) })
    expect(await clientList.json()).toMatchObject({
      items: [{ id: projectId, access: { view: true, comment: true, edit: false } }],
    })
    const observerList = await app.request('/api/projects', { headers: authHeaders(observer.accessToken) })
    expect(await observerList.json()).toMatchObject({
      items: [{ id: projectId, access: { view: true, comment: false, edit: false } }],
    })

    // Паспорт читается клиентом, но правка и создание этапов — только команда.
    const detail = await app.request(`/api/projects/${projectId}`, { headers: authHeaders(client.accessToken) })
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({ name: 'ЖБИ-завод, Уфа', client: 'ООО «Завод ЖБИ»' })

    expect((await app.request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ boundaries: 'Никак' }),
    })).status).toBe(403)
    expect((await app.request(`/api/projects/${projectId}/stages`, {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ name: 'Этап' }),
    })).status).toBe(403)

    const updated = await app.request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ boundaries: 'Обследование производственного контура', shops: ['Цех плит', 'ПДО'] }),
    })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({
      boundaries: 'Обследование производственного контура',
      shops: ['Цех плит', 'ПДО'],
    })

    // Второй проект клиенту не виден: доступ только через членство.
    expect((await createProjectStatus(app, manager, { name: 'Пищепром, Казань' })).status).toBe(201)
    expect(await (await app.request('/api/projects', { headers: authHeaders(client.accessToken) })).json()).toMatchObject({
      items: [{ id: projectId }],
    })

    // Архивация: команда видит и архив; клиент продолжает видеть свой проект.
    expect((await app.request(`/api/projects/${projectId}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ status: 'archived' }),
    })).status).toBe(200)
    // Порядок: активные раньше архивных (status asc), внутри — по обновлению.
    expect(await (await app.request('/api/projects', { headers: authHeaders(owner.accessToken) })).json()).toMatchObject({
      items: [{ status: 'active' }, { id: projectId, status: 'archived' }],
    })
    expect(await (await app.request('/api/projects', { headers: authHeaders(client.accessToken) })).json()).toMatchObject({
      items: [{ id: projectId, status: 'archived' }],
    })
  })

  test('member management belongs to owners and managers only', async () => {
    const analyst = await registerAs(prisma, app, 'members-analyst@ordiks.ru', 'analyst')
    const manager = await registerAs(prisma, app, 'members-manager@ordiks.ru', 'manager')
    const client = await registerAs(prisma, app, 'members-client@demo.ordiks.ru', 'client')
    const projectId = await createProject(app, manager)

    // Аналитик читает состав, но не управляет им.
    expect((await addMember(app, analyst, projectId, client.user.id, 'client_staff')).status).toBe(403)
    expect((await app.request(`/api/projects/${projectId}/members`, { headers: authHeaders(analyst.accessToken) })).status).toBe(200)

    expect((await addMember(app, manager, projectId, '00000000-0000-7000-8000-000000000009', 'client_staff')).status).toBe(404)
    const added = await addMember(app, manager, projectId, client.user.id, 'client_staff')
    expect(added.status).toBe(201)
    const addedMember = await added.json()
    expect(addedMember).toMatchObject({ userId: client.user.id, role: 'client_staff', email: 'members-client@demo.ordiks.ru' })

    // Повторное добавление — конфликт; член со стороны клиента составом не управляет.
    expect((await addMember(app, manager, projectId, client.user.id, 'client_staff')).status).toBe(409)
    expect((await addMember(app, client, projectId, analyst.user.id, 'observer')).status).toBe(403)

    const promoted = await app.request(`/api/projects/${projectId}/members/${addedMember.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ role: 'client_lead' }),
    })
    expect(promoted.status).toBe(200)
    expect(await promoted.json()).toMatchObject({ role: 'client_lead' })

    expect((await app.request(`/api/projects/${projectId}/members/${addedMember.id}`, {
      method: 'DELETE',
      headers: authHeaders(manager.accessToken),
    })).status).toBe(204)
    expect(await (await app.request('/api/projects', { headers: authHeaders(client.accessToken) })).json()).toEqual({ items: [] })
    expect((await app.request(`/api/projects/${projectId}`, { headers: authHeaders(client.accessToken) })).status).toBe(404)
  })

  test('creates a project from a template object: stages, groups, domains, dictionaries', async () => {
    const manager = await registerAs(prisma, app, 'template-manager@ordiks.ru', 'manager')

    const created = await app.request('/api/projects', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({
        name: 'ЖБИ-завод, Уфа',
        client: 'ООО «Завод ЖБИ»',
        city: 'Уфа',
        shops: ['Цех плит'],
        settings: { findingPriorities: ['Критично', 'Низкий'] },
        template,
      }),
    })
    expect(created.status).toBe(201)
    const project = await created.json()

    // Создатель становится участником; справочники дополняются дефолтами прототипа.
    expect(project.members).toEqual([
      expect.objectContaining({ email: 'template-manager@ordiks.ru', role: 'manager' }),
    ])
    expect(project.settings).toMatchObject({
      findingCategories: ['Процесс', 'Данные', 'Оборудование', 'Организация'],
      findingPriorities: ['Критично', 'Низкий'],
      passportFields: [],
      passportValues: {},
    })
    expect(project.settings.findingStatuses.map((status: { id: string }) => status.id)).toContain('registered')
    expect(project.settings.factTypes.map((type: { key: string }) => type.key)).toEqual(['photo', 'file', 'note'])

    const stages = await app.request(`/api/projects/${project.id}/stages`, { headers: authHeaders(manager.accessToken) })
    const stageItems = (await stages.json()).items
    expect(stageItems).toHaveLength(2)
    expect(stageItems[0]).toMatchObject({ name: 'Подготовка', status: 'active', milestone: false, sortOrder: 0 })
    expect(stageItems[1]).toMatchObject({ name: 'Выезд и сбор фактов', status: 'planned', milestone: true, sortOrder: 1 })
    for (const stage of stageItems) {
      expect(stage.startAt).not.toBeNull()
      expect(stage.endAt).not.toBeNull()
    }

    const groups = await app.request(`/api/projects/${project.id}/domain-groups`, { headers: authHeaders(manager.accessToken) })
    expect(await groups.json()).toEqual({
      items: [
        expect.objectContaining({
          name: 'Продажи и заказы',
          domains: [
            expect.objectContaining({
              name: 'Продажи и договоры',
              status: 'not_started',
              checklist: [
                expect.objectContaining({ text: 'Как формируется заказ', done: false }),
                expect.objectContaining({ text: 'Договор', done: false }),
              ],
            }),
          ],
        }),
        expect.objectContaining({
          name: 'Производство',
          domains: [expect.objectContaining({ name: 'Диспетчеризация', checklist: [] })],
        }),
      ],
    })

    const badTemplate = await app.request('/api/projects', {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({
        name: 'Плохой шаблон',
        template: { groups: ['Единственная'], domains: [{ groupIndex: 3, name: 'Мимо группы' }] },
      }),
    })
    expect(badTemplate.status).toBe(400)
    expect((await badTemplate.json()).error.code).toBe('VALIDATION_ERROR')
  })

  test('stage and task CRUD keeps links inside the project and stamps doneAt', async () => {
    const analyst = await registerAs(prisma, app, 'plan-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst, { template: { ...template, domains: [{ groupIndex: 0, name: 'Домен', checklist: [] }] } })
    const client = await registerAs(prisma, app, 'plan-client@demo.ordiks.ru', 'client')
    // Членство добавляет менеджер: аналитик правит проект, но составом не управляет.
    const manager = await registerAs(prisma, app, 'plan-manager@ordiks.ru', 'manager')

    const stageResponse = await app.request(`/api/projects/${projectId}/stages`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ name: 'Новый этап', startAt: '2026-10-05T00:00:00.000Z', endAt: '2026-10-20T00:00:00.000Z' }),
    })
    expect(stageResponse.status).toBe(201)
    const stage = await stageResponse.json()
    expect(stage).toMatchObject({ name: 'Новый этап', status: 'planned', sortOrder: 2, startAt: '2026-10-05T00:00:00.000Z' })

    const groupList = await (await app.request(`/api/projects/${projectId}/domain-groups`, { headers: authHeaders(analyst.accessToken) })).json()
    const domainId = groupList.items[0].domains[0].id

    const taskResponse = await app.request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        title: 'Обойти цех плит',
        description: 'Фото + конспект',
        stageId: stage.id,
        domainId,
        assigneeId: analyst.user.id,
        deadline: '2026-10-12T00:00:00.000Z',
      }),
    })
    expect(taskResponse.status).toBe(201)
    const task = await taskResponse.json()
    expect(task).toMatchObject({ title: 'Обойти цех плит', status: 'todo', stageId: stage.id, domainId, assigneeId: analyst.user.id })

    // Клиент без членства не читает задачи; с членством — читает, но не создаёт.
    expect((await app.request(`/api/projects/${projectId}/tasks`, { headers: authHeaders(client.accessToken) })).status).toBe(404)
    expect((await addMember(app, manager, projectId, client.user.id, 'client_staff')).status).toBe(201)
    expect((await app.request(`/api/projects/${projectId}/tasks`, { headers: authHeaders(client.accessToken) })).status).toBe(200)
    expect((await app.request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ title: 'Своя задача' }),
    })).status).toBe(403)

    // Фильтры по этапу, исполнителю и статусу.
    const second = await (await app.request(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Собрать выгрузку 1С' }),
    })).json()
    const filtered = await (await app.request(
      `/api/projects/${projectId}/tasks?stageId=${stage.id}&assigneeId=${analyst.user.id}&status=todo`,
      { headers: authHeaders(analyst.accessToken) },
    )).json()
    expect(filtered.items.map((item: { id: string }) => item.id)).toEqual([task.id])

    // done проставляет doneAt, возврат в работу — сбрасывает; null очищает дедлайн.
    const done = await (await app.request(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ status: 'done' }),
    })).json()
    expect(done.status).toBe('done')
    expect(done.doneAt).not.toBeNull()
    const reopened = await (await app.request(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ status: 'doing', deadline: null }),
    })).json()
    expect(reopened.doneAt).toBeNull()
    expect(reopened.deadline).toBeNull()

    // Связи из чужого проекта отклоняются.
    const otherProjectId = await createProject(app, analyst, { template })
    const otherStage = (await (await app.request(`/api/projects/${otherProjectId}/stages`, { headers: authHeaders(analyst.accessToken) })).json()).items[0]
    expect((await app.request(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ stageId: otherStage.id }),
    })).status).toBe(400)

    // Удаление этапа отвязывает задачи, удаление задачи — чистит список.
    expect((await app.request(`/api/stages/${stage.id}`, { method: 'DELETE', headers: authHeaders(analyst.accessToken) })).status).toBe(204)
    const afterStageDelete = await (await app.request(`/api/projects/${projectId}/tasks`, { headers: authHeaders(analyst.accessToken) })).json()
    expect(afterStageDelete.items).toHaveLength(2)
    expect(afterStageDelete.items.find((item: { id: string }) => item.id === task.id).stageId).toBeNull()

    expect((await app.request(`/api/tasks/${second.id}`, { method: 'DELETE', headers: authHeaders(analyst.accessToken) })).status).toBe(204)
    expect((await app.request(`/api/tasks/${second.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Нет такой' }),
    })).status).toBe(404)
  })

  test('domain and checklist CRUD recomputes the domain status from its checklist', async () => {
    const analyst = await registerAs(prisma, app, 'domain-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst, { template: { ...template, domains: [] } })
    const client = await registerAs(prisma, app, 'domain-client@demo.ordiks.ru', 'client')

    const groupResponse = await app.request(`/api/projects/${projectId}/domain-groups`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ name: 'Качество' }),
    })
    expect(groupResponse.status).toBe(201)
    const group = await groupResponse.json()
    expect(group).toMatchObject({ name: 'Качество', sortOrder: 2, domains: [] })

    const domainResponse = await app.request(`/api/projects/${projectId}/domains`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ groupId: group.id, name: 'ОТК', ownerId: analyst.user.id, checklist: ['Контрольные точки', 'Регистрация несоответствий'] }),
    })
    expect(domainResponse.status).toBe(201)
    const domain = await domainResponse.json()
    expect(domain).toMatchObject({
      name: 'ОТК',
      status: 'not_started',
      ownerId: analyst.user.id,
    })
    expect(domain.checklist).toHaveLength(2)
    expect(domain.checklist[0]).toMatchObject({ text: 'Контрольные точки', done: false })
    expect(domain.checklist[1]).toMatchObject({ text: 'Регистрация несоответствий', done: false })
    expect((await app.request(`/api/projects/${projectId}/domains`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ groupId: '00000000-0000-7000-8000-00000000000a', name: 'Мимо' }),
    })).status).toBe(400)

    // Клиент без членства домен не видит (404 не выдаёт существование).
    expect((await app.request(`/api/domains/${domain.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ name: 'ОТК цеха' }),
    })).status).toBe(404)

    const [firstItem, secondItem] = domain.checklist

    // Один done → in_progress; все done → closed; снятие галочки → обратно in_progress;
    // ни одного done → статус не понижается.
    await checkItem(app, analyst, firstItem.id, true)
    await expectDomainStatus(prisma, domain.id, 'in_progress')
    await checkItem(app, analyst, secondItem.id, true)
    await expectDomainStatus(prisma, domain.id, 'closed')
    await checkItem(app, analyst, secondItem.id, false)
    await expectDomainStatus(prisma, domain.id, 'in_progress')
    await checkItem(app, analyst, firstItem.id, false)
    await expectDomainStatus(prisma, domain.id, 'in_progress')

    // Ручная установка статуса выживает правки чек-листа, пока нет выполненных пунктов.
    const manual = await (await app.request(`/api/domains/${domain.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ status: 'closed' }),
    })).json()
    expect(manual.status).toBe('closed')
    const added = await (await app.request(`/api/domains/${domain.id}/checklist`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ text: 'Анализы причин' }),
    })).json()
    expect(added).toMatchObject({ text: 'Анализы причин', done: false })
    await expectDomainStatus(prisma, domain.id, 'closed')

    expect((await app.request(`/api/checklist-items/${added.id}`, {
      method: 'DELETE',
      headers: authHeaders(analyst.accessToken),
    })).status).toBe(204)
    await expectDomainStatus(prisma, domain.id, 'closed')

    // Как только появляется выполненный пункт, автоматика снова берёт своё: любой done → in_progress.
    const resumed = await (await app.request(`/api/domains/${domain.id}/checklist`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ text: 'Контрольные точки (повторно)', done: true }),
    })).json()
    expect(resumed).toMatchObject({ done: true })
    await expectDomainStatus(prisma, domain.id, 'in_progress')

    // Группа из другого проекта отклоняется; удаление группы тянет домены за собой.
    const otherProjectId = await createProject(app, analyst, { template: { ...template, domains: [] } })
    const otherGroup = (await (await app.request(`/api/projects/${otherProjectId}/domain-groups`, { headers: authHeaders(analyst.accessToken) })).json()).items[0]
    expect((await app.request(`/api/domains/${domain.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ groupId: otherGroup.id }),
    })).status).toBe(400)

    expect((await app.request(`/api/domain-groups/${group.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ name: 'Качество и лаборатория' }),
    })).status).toBe(200)
    expect((await app.request(`/api/domain-groups/${group.id}`, { method: 'DELETE', headers: authHeaders(analyst.accessToken) })).status).toBe(204)
    expect(await prisma.domain.count({ where: { id: domain.id } })).toBe(0)
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

async function createProjectStatus(app: App, session: Session, project: object) {
  return app.request('/api/projects', {
    method: 'POST',
    headers: jsonHeaders(session.accessToken),
    body: JSON.stringify(project),
  })
}

async function createProject(
  app: App,
  session: Session,
  options: { project?: { name?: string } & object; template?: object } = {},
) {
  const response = await createProjectStatus(app, session, {
    name: options.project?.name ?? `Проект ${crypto.randomUUID().slice(0, 8)}`,
    ...options.project,
    ...(options.template === undefined ? {} : { template: options.template }),
  })
  expect(response.status).toBe(201)
  return (await response.json()).id
}

async function addMember(app: App, session: Session, projectId: string, userId: string, role: string) {
  return app.request(`/api/projects/${projectId}/members`, {
    method: 'POST',
    headers: jsonHeaders(session.accessToken),
    body: JSON.stringify({ userId, role }),
  })
}

async function checkItem(app: App, session: Session, itemId: string, done: boolean) {
  const response = await app.request(`/api/checklist-items/${itemId}`, {
    method: 'PATCH',
    headers: jsonHeaders(session.accessToken),
    body: JSON.stringify({ done }),
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ done })
}

async function expectDomainStatus(prisma: DbClient, domainId: string, status: DomainStatus) {
  const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { status: true } })
  expect(domain).toEqual({ status })
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

function jsonHeaders(accessToken: string) {
  return { ...authHeaders(accessToken), 'Content-Type': 'application/json' }
}
