import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from '../app'
import { createPrisma, type DbClient } from '../db'
import { loadEnv } from '../env'
import { privateStorageConfigFromEnv, type FilesystemStorageConfig } from '../storage/config'
import { createFilesystemStorageRoutes } from '../storage/filesystem-routes'
import { FilesystemPrivateStorage } from '../storage/filesystem-storage'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

const template = {
  stageNames: ['Подготовка'],
  groups: ['Производство', 'Качество'],
  domains: [
    { groupIndex: 0, name: 'Планирование: цех плит', checklist: ['Вход: заказы', 'Составление плана'] },
    { groupIndex: 1, name: 'ОТК', checklist: ['Контрольные точки'] },
  ],
}

type Session = { accessToken: string; user: { id: string; email: string } }
type App = ReturnType<typeof createApp>

describe('B3 API integration (processes, report, comments, notifications, registries, templates)', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: 'http://localhost:5173',
    ACCESS_TOKEN_TTL_SECONDS: '60',
    AUTH_RATE_LIMIT_MAX: '1000',
  })
  const prisma = createPrisma(databaseUrl)
  let root: string
  let storage: FilesystemPrivateStorage
  let app: App

  beforeEach(async () => {
    await prisma.invite.deleteMany()
    await prisma.project.deleteMany()
    await prisma.projectTemplate.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.passwordResetToken.deleteMany()
    await prisma.user.deleteMany()

    root = await mkdtemp(join(tmpdir(), 'b3-integration-'))
    const config = privateStorageConfigFromEnv({
      ...env,
      PRIVATE_STORAGE_LOCAL_ROOT: root,
    }) as FilesystemStorageConfig
    storage = new FilesystemPrivateStorage(config)
    app = createApp({
      env,
      prisma,
      privateStorage: { storage, httpRoutes: createFilesystemStorageRoutes(config) },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await rm(root, { recursive: true, force: true })
  })

  test('processes: CRUD шагов с mapTo/disappears, переупорядочивание; схема ticket→PUT→confirm→download→replace', async () => {
    const analyst = await registerAs(prisma, app, 'pr-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst)
    const manager = await registerAs(prisma, app, 'pr-manager@ordiks.ru', 'manager')
    const client = await registerAs(prisma, app, 'pr-client@demo.ordiks.ru', 'client')
    expect((await addMember(app, manager, projectId, client.user.id, 'client_lead')).status).toBe(201)

    const process = await (await app.request(`/api/projects/${projectId}/processes`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ name: 'Путь клиентского заказа' }),
    })).json()
    expect(process.steps).toEqual([])
    expect(process.schemes).toEqual([])

    // Клиент не редактирует процессы.
    expect((await app.request(`/api/projects/${projectId}/processes`, {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ name: 'Никак' }),
    })).status).toBe(403)

    // TO-BE шаги, затем AS-IS с mapTo и disappears.
    const tb1 = await (await app.request(`/api/processes/${process.id}/steps`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ side: 'tobe', title: 'Заказ в единой системе', actorRole: 'Менеджер', tools: ['система'], effect: 'Один источник правды' }),
    })).json()
    const tb2 = await (await app.request(`/api/processes/${process.id}/steps`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ side: 'tobe', title: 'Автопроверка сроков', actorRole: 'Система', tools: ['система'] }),
    })).json()
    // Ответ — дерево процесса: созданный шаг всегда последний своей стороны.
    const tb1Id = tb1.steps.at(-1).id as string
    const tb2Id = tb2.steps.at(-1).id as string

    const as1 = await (await app.request(`/api/processes/${process.id}/steps`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ side: 'asis', title: 'Заказ в Excel', actorRole: 'Менеджер', tools: ['Excel'], mapToStepId: tb1Id }),
    })).json()
    expect(as1.steps.find((step: { side: string }) => step.side === 'asis').mapToStepId).toBe(tb1Id)

    // mapTo на шаг asis → 400; disappears вместе с mapTo → 400 (и в контракте, и в сервисе).
    expect((await app.request(`/api/processes/${process.id}/steps`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ side: 'tobe', title: 'Никак', mapToStepId: tb1Id }),
    })).status).toBe(400)
    expect((await app.request(`/api/processes/${process.id}/steps`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ side: 'asis', title: 'Согласование по телефону', mapToStepId: tb1Id, disappears: true }),
    })).status).toBe(400)

    const as2 = await (await app.request(`/api/processes/${process.id}/steps`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ side: 'asis', title: 'Устное согласование', actorRole: 'Диспетчер', tools: ['телефон'], disappears: true }),
    })).json()
    const disappearing = as2.steps.find((step: { side: string; disappears: boolean }) => step.side === 'asis' && step.disappears)
    expect(disappearing.mapToStepId).toBeNull()

    // Переупорядочивание: полный список одной стороны.
    const reordered = await (await app.request(`/api/processes/${process.id}/steps/reorder`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ side: 'tobe', ids: [tb2Id, tb1Id] }),
    })).json()
    expect(reordered.steps.filter((step: { side: string }) => step.side === 'tobe').map((step: { title: string }) => step.title)).toEqual(['Автопроверка сроков', 'Заказ в единой системе'])
    expect((await app.request(`/api/processes/${process.id}/steps/reorder`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ side: 'tobe', ids: [tb1Id] }),
    })).status).toBe(400)

    // Схема: тикет → PUT в хранилище → confirm; png 1×1.
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(48, 0x20)])
    const upload = await requestSchemeTicket(app, analyst, process.id, 'asis', 'image/png', png)
    expect(upload.url).toContain(`/projects/${projectId}/processes/${process.id}/asis/`)
    const put = await app.request(upload.url, { method: 'PUT', headers: upload.headers, body: png })
    expect(put.status).toBe(200)

    expect((await app.request(`/api/processes/${process.id}/schemes/asis/confirm`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ token: upload.token, fileName: 'storm-as-is.png' }),
    })).status).toBe(200)
    const withScheme = await (await app.request(`/api/processes/${process.id}`, { headers: authHeaders(analyst.accessToken) })).json()
    expect(withScheme.schemes).toHaveLength(1)
    expect(withScheme.schemes[0]).toMatchObject({ side: 'asis', fileName: 'storm-as-is.png' })

    // Контент-тайп вне списка png/svg/jpeg/webp → 400 контрактом.
    expect((await app.request(`/api/processes/${process.id}/schemes/asis/upload-request`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ contentType: 'application/pdf', byteSize: 10 }),
    })).status).toBe(400)

    // Скачивание — все роли проекта; до загрузки на tobe — 404.
    const download = await (await app.request(`/api/processes/${process.id}/schemes/asis/download`, {
      headers: authHeaders(client.accessToken),
    })).json()
    expect(download.url).toContain('/storage/objects/')
    expect((await app.request(`/api/processes/${process.id}/schemes/tobe/download`, {
      headers: authHeaders(client.accessToken),
    })).status).toBe(404)

    // Замена: новый объект, старый удаляется после ответа.
    const otherPng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 0x30)])
    const replaceUpload = await requestSchemeTicket(app, analyst, process.id, 'asis', 'image/png', otherPng)
    await app.request(replaceUpload.url, { method: 'PUT', headers: replaceUpload.headers, body: otherPng })
    const replaced = await (await app.request(`/api/processes/${process.id}/schemes/asis/confirm`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ token: replaceUpload.token, fileName: 'storm-as-is-v2.png' }),
    })).json()
    expect(replaced.schemes[0].fileName).toBe('storm-as-is-v2.png')
    await waitForDeletion(storage, objectKeyFromUrl(upload.url))

    // Посторонний не видит процесс.
    const outsider = await registerAs(prisma, app, 'pr-outsider@demo.ordiks.ru', 'client')
    expect((await app.request(`/api/processes/${process.id}`, { headers: authHeaders(outsider.accessToken) })).status).toBe(404)
  })

  test('report: санитизация при сохранении, автовставки findings+risks, визы и ready-сводка', async () => {
    const analyst = await registerAs(prisma, app, 'rep-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst)
    const domainId = await firstDomainId(app, analyst, projectId)
    const manager = await registerAs(prisma, app, 'rep-manager@ordiks.ru', 'manager')
    const lead = await registerAs(prisma, app, 'rep-lead@demo.ordiks.ru', 'client')
    const staff = await registerAs(prisma, app, 'rep-staff@demo.ordiks.ru', 'client')
    const observer = await registerAs(prisma, app, 'rep-observer@demo.ordiks.ru', 'client')
    for (const [user, role] of [[lead, 'client_lead'], [staff, 'client_staff'], [observer, 'observer']] as const) {
      expect((await addMember(app, manager, projectId, user.user.id, role)).status).toBe(201)
    }

    await app.request(`/api/projects/${projectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'План в трёх местах', priority: 'Критично', domainId }),
    })
    await app.request(`/api/projects/${projectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Нет связи с ППР', priority: 'Высокий', domainId, status: 'confirmed' }),
    })
    await app.request(`/api/projects/${projectId}/risks`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Срыв данных', probability: 4, impact: 3, domainId }),
    })

    // Санитизация: скрипт и атрибуты вырезаются при создании и при правке.
    const section = await (await app.request(`/api/projects/${projectId}/report/sections`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        title: '1. Проблемы',
        body: '<p>Текст</p><script>alert(1)</script><p onclick="x">с атрибутом</p><iframe src="x"></iframe>',
      }),
    })).json()
    expect(section.body).toBe('<p>Текст</p><p>с атрибутом</p>')

    // Автовставка находок домена: таблица дописывается в конец body.
    const inserted = await (await app.request(`/api/projects/${projectId}/report/insert`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ sectionId: section.id, kind: 'findings', domainId }),
    })).json()
    expect(inserted.section.body).toContain('<h3>Проблемы: Планирование: цех плит</h3>')
    expect(inserted.section.body).toContain('<td>План в трёх местах</td><td>Критично</td><td>Зарегистрирована</td>')
    expect(inserted.section.body).toContain('<td>Нет связи с ППР</td><td>Высокий</td><td>Подтверждена</td>')

    // Автовставка рисков: критичность в таблице.
    const riskSection = await (await app.request(`/api/projects/${projectId}/report/sections`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: '2. Риски' }),
    })).json()
    const risksInserted = await (await app.request(`/api/projects/${projectId}/report/insert`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ sectionId: riskSection.id, kind: 'risks' }),
    })).json()
    expect(risksInserted.section.body).toContain('<td>Срыв данных</td><td>4</td><td>3</td><td>12</td>')

    // Пустой источник → 400.
    const emptyDomain = await (await app.request(`/api/projects/${projectId}/domain-groups`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    const qualityDomain = emptyDomain.items[1].domains[0].id
    expect((await app.request(`/api/projects/${projectId}/report/insert`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ sectionId: section.id, kind: 'findings', domainId: qualityDomain }),
    })).status).toBe(400)
    // Чужой домен → 400.
    const otherProjectId = await createProject(app, analyst, { name: 'Чужой проект' })
    const otherDomain = await firstDomainId(app, analyst, otherProjectId)
    expect((await app.request(`/api/projects/${projectId}/report/insert`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ sectionId: section.id, kind: 'findings', domainId: otherDomain }),
    })).status).toBe(400)

    // Клиент не редактирует отчёт, но визирует; наблюдатель не визирует.
    expect((await app.request(`/api/projects/${projectId}/report/sections`, {
      method: 'POST',
      headers: jsonHeaders(lead.accessToken),
      body: JSON.stringify({ title: 'Нет' }),
    })).status).toBe(403)
    expect((await app.request(`/api/report-sections/${section.id}/approval`, {
      method: 'PUT',
      headers: jsonHeaders(lead.accessToken),
      body: JSON.stringify({ decision: 'approved', comment: 'Согласовано' }),
    })).status).toBe(200)
    expect((await app.request(`/api/report-sections/${section.id}/approval`, {
      method: 'PUT',
      headers: jsonHeaders(staff.accessToken),
      body: JSON.stringify({ decision: 'changes', comment: 'Дополнить' }),
    })).status).toBe(200)
    expect((await app.request(`/api/report-sections/${section.id}/approval`, {
      method: 'PUT',
      headers: jsonHeaders(observer.accessToken),
      body: JSON.stringify({ decision: 'approved' }),
    })).status).toBe(403)

    // Повторная виза перезаписывается (staff меняет решение).
    await app.request(`/api/report-sections/${section.id}/approval`, {
      method: 'PUT',
      headers: jsonHeaders(staff.accessToken),
      body: JSON.stringify({ decision: 'approved', comment: 'Замечание снято' }),
    })
    const withVisas = await (await app.request(`/api/report-sections/${section.id}`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(withVisas.approvals).toHaveLength(2)
    expect(withVisas.approvals.find((approval: { email: string }) => approval.email === 'rep-staff@demo.ordiks.ru').decision).toBe('approved')

    // Сводка готовности: 2 раздела, согласован 1 (оба клиента ok), ждёт — раздел 2 у обоих.
    const report = await (await app.request(`/api/projects/${projectId}/report`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(report.readiness).toMatchObject({ sections: 2, agreed: 1, withIssues: 0 })
    expect(report.readiness.pending).toHaveLength(2)
    expect(report.readiness.pending.every((entry: { sections: number }) => entry.sections === 1)).toBe(true)

    // Правка содержимого обнуляет визы.
    await app.request(`/api/report-sections/${section.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ body: '<p>Обновлённый текст</p>' }),
    })
    const afterEdit = await (await app.request(`/api/report-sections/${section.id}`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(afterEdit.approvals).toEqual([])
  })

  test('comments: треды по объектам, права (observer читает/не пишет, клиент пишет), чужой проект 404; notifications: только свои проекты, read гасит', async () => {
    const analyst = await registerAs(prisma, app, 'cm-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst)
    const domainId = await firstDomainId(app, analyst, projectId)
    const manager = await registerAs(prisma, app, 'cm-manager@ordiks.ru', 'manager')
    const lead = await registerAs(prisma, app, 'cm-lead@demo.ordiks.ru', 'client')
    const staff = await registerAs(prisma, app, 'cm-staff@demo.ordiks.ru', 'client')
    const observer = await registerAs(prisma, app, 'cm-observer@demo.ordiks.ru', 'client')
    for (const [user, role] of [[lead, 'client_lead'], [staff, 'client_staff'], [observer, 'observer']] as const) {
      expect((await addMember(app, manager, projectId, user.user.id, role)).status).toBe(201)
    }

    const finding = await (await app.request(`/api/projects/${projectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Факт смены с задержкой', domainId }),
    })).json()

    // Клиент_lead пишет (needsAnswer), команда отвечает; ascending.
    expect((await app.request(`/api/projects/${projectId}/comments`, {
      method: 'POST',
      headers: jsonHeaders(lead.accessToken),
      body: JSON.stringify({ threadType: 'finding', threadId: finding.id, body: 'Хотелось бы видеть статус в течение дня', needsAnswer: true }),
    })).status).toBe(201)
    await app.request(`/api/projects/${projectId}/comments`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ threadType: 'finding', threadId: finding.id, body: 'Принято, уходит в TO-BE' }),
    })
    const thread = await (await app.request(`/api/projects/${projectId}/comments?threadType=finding&threadId=${finding.id}`, {
      headers: authHeaders(observer.accessToken),
    })).json()
    expect(thread.items.map((comment: { needsAnswer: boolean }) => comment.needsAnswer)).toEqual([true, false])
    expect(thread.items[0].authorEmail).toBe('cm-lead@demo.ordiks.ru')

    // Наблюдатель не пишет (403), staff пишет.
    expect((await app.request(`/api/projects/${projectId}/comments`, {
      method: 'POST',
      headers: jsonHeaders(observer.accessToken),
      body: JSON.stringify({ threadType: 'finding', threadId: finding.id, body: 'Никак' }),
    })).status).toBe(403)
    expect((await app.request(`/api/projects/${projectId}/comments`, {
      method: 'POST',
      headers: jsonHeaders(staff.accessToken),
      body: JSON.stringify({ threadType: 'finding', threadId: finding.id, body: 'Подтверждаем на своей стороне' }),
    })).status).toBe(201)

    // Объект треда не существует / из чужого проекта / тип не тот → 400.
    expect((await app.request(`/api/projects/${projectId}/comments`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ threadType: 'finding', threadId: domainId, body: 'Не тот тип' }),
    })).status).toBe(400)
    const otherProjectId = await createProject(app, analyst, { name: 'Чужой проект' })
    const otherFinding = await (await app.request(`/api/projects/${otherProjectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Чужая находка' }),
    })).json()
    expect((await app.request(`/api/projects/${projectId}/comments`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ threadType: 'finding', threadId: otherFinding.id, body: 'Чужой объект' }),
    })).status).toBe(400)

    // Свой комментарий правит автор; чужой — только команда; клиент_lead чужой — 403.
    const mine = thread.items[1]
    expect((await app.request(`/api/comments/${mine.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ body: 'Принято, уходит в TO-BE (уточнено)' }),
    })).status).toBe(200)
    const theirs = thread.items[0]
    expect((await app.request(`/api/comments/${theirs.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(lead.accessToken),
      body: JSON.stringify({ body: 'Правка автора' }),
    })).status).toBe(200)
    expect((await app.request(`/api/comments/${theirs.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(staff.accessToken),
      body: JSON.stringify({ body: 'Не автор' }),
    })).status).toBe(403)

    // Уведомления: клиент видит только свой проект; команда — оба.
    await app.request(`/api/projects/${otherProjectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Вторая проекта' }),
    })
    const leadNotifications = await (await app.request('/api/me/notifications', {
      headers: authHeaders(lead.accessToken),
    })).json()
    expect(leadNotifications.items.every((item: { project: { id: string } }) => item.project.id === projectId)).toBe(true)
    expect(leadNotifications.items.length).toBeGreaterThan(0)
    const first = leadNotifications.items[0]
    expect(first.thread).toMatchObject({ threadType: 'finding', threadId: finding.id, route: 'findings' })
    expect(first.thread.title).toBe('Факт смены с задержкой')

    // unreadComments в списке проектов; read гасит.
    const projectsBefore = await (await app.request('/api/projects', { headers: authHeaders(lead.accessToken) })).json()
    const mineBefore = projectsBefore.items.find((item: { id: string }) => item.id === projectId)
    expect(mineBefore.unreadComments).toBe(2)

    await app.request('/api/me/notifications/read', {
      method: 'POST',
      headers: jsonHeaders(lead.accessToken),
      body: JSON.stringify({ threadType: 'finding', threadId: finding.id }),
    })
    const notificationsAfter = await (await app.request('/api/me/notifications', {
      headers: authHeaders(lead.accessToken),
    })).json()
    expect(notificationsAfter.items.filter((item: { thread: { threadId: string } }) => item.thread.threadId === finding.id)).toEqual([])
    const projectsAfter = await (await app.request('/api/projects', { headers: authHeaders(lead.accessToken) })).json()
    expect(projectsAfter.items.find((item: { id: string }) => item.id === projectId).unreadComments).toBe(0)

    // Посторонний: комментариев не видит, свой комментарий в чужом проекте — 404.
    const outsider = await registerAs(prisma, app, 'cm-outsider@demo.ordiks.ru', 'client')
    const outsiderNotifications = await (await app.request('/api/me/notifications', {
      headers: authHeaders(outsider.accessToken),
    })).json()
    expect(outsiderNotifications).toEqual({ items: [] })
    expect((await app.request(`/api/projects/${projectId}/comments`, {
      method: 'POST',
      headers: jsonHeaders(outsider.accessToken),
      body: JSON.stringify({ threadType: 'finding', threadId: finding.id, body: 'Чужой проект' }),
    })).status).toBe(404)
  })

  test('registries: конструктор с формулой, записи с computed, поиск/фильтр, bulk, удаление поля чистит values, удаление статуса переносит; импорт', async () => {
    const analyst = await registerAs(prisma, app, 'rg-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst)
    const manager = await registerAs(prisma, app, 'rg-manager@ordiks.ru', 'manager')
    const observer = await registerAs(prisma, app, 'rg-observer@demo.ordiks.ru', 'client')
    expect((await addMember(app, manager, projectId, observer.user.id, 'observer')).status).toBe(201)

    const registry = await (await app.request(`/api/projects/${projectId}/registries`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ name: 'Оснастка', description: 'Ресурс форм' }),
    })).json()

    // Поля: number ×2, formula (остаток = total − worked), select, date.
    await app.request(`/api/registries/${registry.id}/fields`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ key: 'total', name: 'Циклов всего', type: 'number' }),
    })
    await app.request(`/api/registries/${registry.id}/fields`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ key: 'worked', name: 'Циклов наработки', type: 'number' }),
    })
    const withFormula = await (await app.request(`/api/registries/${registry.id}/fields`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ key: 'left', name: 'Циклов остаток', type: 'formula', formula: { op: '-', a: { type: 'field', key: 'total' }, b: { type: 'field', key: 'worked' } } }),
    })).json()
    expect(withFormula.fields.find((field: { key: string }) => field.key === 'left').formula).toMatchObject({ op: '-' })

    // Формула на text-поле → 400; дубликат ключа → 400.
    await app.request(`/api/registries/${registry.id}/fields`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ key: 'note', name: 'Заметка', type: 'text' }),
    })
    expect((await app.request(`/api/registries/${registry.id}/fields`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ key: 'bad', name: 'Плохая формула', type: 'formula', formula: { op: '-', a: { type: 'field', key: 'note' }, b: { type: 'const', value: 1 } } }),
    })).status).toBe(400)
    expect((await app.request(`/api/registries/${registry.id}/fields`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ key: 'total', name: 'Дубль', type: 'number' }),
    })).status).toBe(400)

    const statuses = ['В работе', 'В ремонте', 'Списана']
    for (const [index, name] of statuses.entries()) {
      await app.request(`/api/registries/${registry.id}/statuses`, {
        method: 'POST',
        headers: jsonHeaders(analyst.accessToken),
        body: JSON.stringify({ name, color: index === 0 ? 'blue' : index === 1 ? 'amber' : 'gray' }),
      })
    }
    const tree = await (await app.request(`/api/registries/${registry.id}`, { headers: authHeaders(analyst.accessToken) })).json()
    const statusWork = tree.statuses.find((status: { name: string }) => status.name === 'В работе').id
    const statusRepair = tree.statuses.find((status: { name: string }) => status.name === 'В ремонте').id

    // Записи: формулы вычисляются в DTO; formula-ключ в values запрещён; типы сверяются.
    const entry = await (await app.request(`/api/registries/${registry.id}/entries`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ values: { total: 12000, worked: 7700 }, statusId: statusWork }),
    })).json()
    expect(entry.computed).toEqual({ left: 4300 })
    expect((await app.request(`/api/registries/${registry.id}/entries`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ values: { left: 5 } }),
    })).status).toBe(400)
    expect((await app.request(`/api/registries/${registry.id}/entries`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ values: { total: 'много' } }),
    })).status).toBe(400)

    // Импорт из текста: таб-разделитель, заголовок, маппинг по ключам; кривые строки пропущены с отчётом.
    await app.request(`/api/registries/${registry.id}/fields`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ key: 'number', name: 'Номер', type: 'text' }),
    })
    const importText = [
      'Номер\tВсего\tНаработка\tСтатус',
      'Ф-201\t12000\t900\tВ работе',
      'М-31\t8000\t7190\tв ремонте',
      'Ф-202\tмного\t50\tВ работе',
      'Ф-203\t4000\t0\tНезнакомый статус',
    ].join('\n')
    const imported = await (await app.request(`/api/registries/${registry.id}/import`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        text: importText,
        hasHeader: true,
        mapping: { 0: 'number', 1: 'total', 2: 'worked', 3: 'status' },
        statusId: statusWork,
      }),
    })).json()
    expect(imported.created).toBe(3)
    expect(imported.skipped).toEqual([{ line: 3, reason: 'Циклов всего: «много» — не число' }])
    expect(imported.defaultStatus).toBe(1)

    // Поиск по значениям + фильтр по статусу; наблюдатель читает.
    const entries = await (await app.request(`/api/registries/${registry.id}/entries`, { headers: authHeaders(observer.accessToken) })).json()
    expect(entries.items).toHaveLength(4)
    const found = await (await app.request(`/api/registries/${registry.id}/entries?q=Ф-201`, { headers: authHeaders(analyst.accessToken) })).json()
    expect(found.items).toHaveLength(1)
    const inRepair = await (await app.request(`/api/registries/${registry.id}/entries?statusId=${statusRepair}`, { headers: authHeaders(analyst.accessToken) })).json()
    expect(inRepair.items.map((item: { values: { number: string } }) => item.values.number)).toEqual(['М-31'])

    // Массовая смена статуса и удаление.
    const bulk = await (await app.request(`/api/registries/${registry.id}/entries/bulk-status`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ ids: [entry.id, found.items[0].id], statusId: statusRepair }),
    })).json()
    expect(bulk.updated).toBe(2)
    const bulkDeleted = await (await app.request(`/api/registries/${registry.id}/entries/bulk-delete`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ ids: [found.items[0].id] }),
    })).json()
    expect(bulkDeleted.deleted).toBe(1)

    // Удаление поля чистит values записей.
    const workedFieldId = tree.fields.find((field: { key: string }) => field.key === 'worked').id
    expect((await app.request(`/api/registry-fields/${workedFieldId}`, { method: 'DELETE', headers: authHeaders(analyst.accessToken) })).status).toBe(204)
    const afterFieldDelete = await (await app.request(`/api/registries/${registry.id}/entries`, { headers: authHeaders(analyst.accessToken) })).json()
    for (const item of afterFieldDelete.items) {
      expect('worked' in item.values).toBe(false)
      expect(item.computed.left).toBeNull()
    }

    // Удаление статуса в использовании: записи переезжают на первый оставшийся.
    const moveResult = await (await app.request(`/api/registry-statuses/${statusRepair}`, { method: 'DELETE', headers: authHeaders(analyst.accessToken) })).json()
    expect(moveResult.movedCount).toBe(2)
    expect(moveResult.movedTo).toBe(statusWork)
    const afterStatusDelete = await (await app.request(`/api/registries/${registry.id}`, { headers: authHeaders(analyst.accessToken) })).json()
    expect(afterStatusDelete.statuses.map((status: { name: string }) => status.name)).toEqual(['В работе', 'Списана'])
  })

  test('analytics: риски с criticality и фильтрами, GAP со связями, требования; чужие ссылки — 400', async () => {
    const analyst = await registerAs(prisma, app, 'an-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst)
    const manager = await registerAs(prisma, app, 'an-manager@ordiks.ru', 'manager')
    const client = await registerAs(prisma, app, 'an-client@demo.ordiks.ru', 'client')
    expect((await addMember(app, manager, projectId, client.user.id, 'client_staff')).status).toBe(201)
    const domainId = await firstDomainId(app, analyst, projectId)

    // Клиент не создаёт риски, но читает.
    expect((await app.request(`/api/projects/${projectId}/risks`, {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ title: 'Никак' }),
    })).status).toBe(403)

    const risk = await (await app.request(`/api/projects/${projectId}/risks`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Отказ формы', probability: 3, impact: 5, domainId, ownerId: client.user.id, mitigation: 'Учёт циклов' }),
    })).json()
    expect(risk.criticality).toBe(15)
    await app.request(`/api/projects/${projectId}/risks`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Срыв данных', probability: 4, impact: 3, status: 'mitigated' }),
    })

    const byDomain = await (await app.request(`/api/projects/${projectId}/risks?domainId=${domainId}`, {
      headers: authHeaders(client.accessToken),
    })).json()
    expect(byDomain.items).toHaveLength(1)
    const byStatus = await (await app.request(`/api/projects/${projectId}/risks?status=mitigated`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(byStatus.items.map((item: { title: string }) => item.title)).toEqual(['Срыв данных'])

    // GAP со связью на находку; находка из чужого проекта → 400.
    const finding = await (await app.request(`/api/projects/${projectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Ресурс не учитывается', domainId }),
    })).json()
    const gap = await (await app.request(`/api/projects/${projectId}/gaps`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ requirement: 'Прогноз ресурса форм', kind: 'dev', findingId: finding.id, domainId }),
    })).json()
    expect(gap).toMatchObject({ requirement: 'Прогноз ресурса форм', kind: 'dev', status: 'open' })

    const otherProjectId = await createProject(app, analyst, { name: 'Чужой проект' })
    const otherFinding = await (await app.request(`/api/projects/${otherProjectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Чужая' }),
    })).json()
    expect((await app.request(`/api/projects/${projectId}/gaps`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ requirement: 'Плохая связь', findingId: otherFinding.id }),
    })).status).toBe(400)

    // Требования MoSCoW + фильтр; решения/коммуникации/quick wins/базлайн минимально.
    await app.request(`/api/projects/${projectId}/requirements`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Статус заказа онлайн', moscow: 'must', domainId }),
    })
    await app.request(`/api/projects/${projectId}/requirements`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Банковская интеграция', moscow: 'wont' }),
    })
    const musts = await (await app.request(`/api/projects/${projectId}/requirements?moscow=must`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(musts.items.map((item: { title: string }) => item.title)).toEqual(['Статус заказа онлайн'])

    const decision = await (await app.request(`/api/projects/${projectId}/decisions`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Пилот с цеха плит', rationale: 'Явные боли', participants: 'Иван, Анна' }),
    })).json()
    expect(decision.status).toBe('active')
    const superseded = await (await app.request(`/api/decisions/${decision.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ status: 'superseded' }),
    })).json()
    expect(superseded.status).toBe('superseded')

    const communication = await (await app.request(`/api/projects/${projectId}/communications`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Стартовая планёрка', kind: 'meeting', participants: 'Иван, Рустем', summary: 'План выезда' }),
    })).json()
    expect(communication.kind).toBe('meeting')

    const quickWin = await (await app.request(`/api/projects/${projectId}/quick-wins`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Ярлыки на склад', effort: 'средний', domainId }),
    })).json()
    expect(quickWin.status).toBe('suggested')

    const baseline = await (await app.request(`/api/projects/${projectId}/baselines`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ metric: 'Срок заказа', value: '21', unit: 'дней', source: 'интервью' }),
    })).json()
    expect(baseline.value).toBe('21')

    // Посторонний — 404 на элемент.
    const outsider = await registerAs(prisma, app, 'an-outsider@demo.ordiks.ru', 'client')
    expect((await app.request(`/api/risks/${risk.id}`, { headers: authHeaders(outsider.accessToken) })).status).toBe(404)
  })

  test('templates: CRUD права, from-template разворачивает структуру с перевязкой showIf, to-template — снимок без записей', async () => {
    const owner = await registerAs(prisma, app, 'tpl-owner@ordiks.ru', 'owner')
    const analyst = await registerAs(prisma, app, 'tpl-analyst@ordiks.ru', 'analyst')
    const client = await registerAs(prisma, app, 'tpl-client@demo.ordiks.ru', 'client')

    // Клиент библиотеку не видит; analyst читает, но не пишет.
    expect((await app.request('/api/project-templates', { headers: authHeaders(client.accessToken) })).status).toBe(403)
    expect((await app.request('/api/project-templates', { headers: authHeaders(analyst.accessToken) })).status).toBe(200)
    expect((await app.request('/api/project-templates', {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ name: 'Шаблон аналитика', payload: {} }),
    })).status).toBe(403)

    const created = await (await app.request('/api/project-templates', {
      method: 'POST',
      headers: jsonHeaders(owner.accessToken),
      body: JSON.stringify({
        name: 'Экспресс-диагностика',
        description: 'Тестовый шаблон',
        payload: {
          stageNames: ['Диагностика', 'Отчёт'],
          weeks: 2,
          groups: ['Диагностика'],
          domains: [{ groupIndex: 0, name: 'Продажи и заказы', checklist: ['Путь заказа', 'Где теряется информация'] }],
          reportSections: ['1. Сводка наблюдений', '2. Быстрые улучшения'],
          guides: [
            {
              name: 'Опросник: продажи',
              sections: [
                {
                  title: 'Процесс',
                  questions: [
                    { clientRefId: 'q1', type: 'yn', text: 'План в системе?', options: [] },
                    { clientRefId: 'q2', type: 'text', text: 'Если нет — где?', options: [], showIfClientRefId: 'q1', showIfValue: 'no' },
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
                { key: 'date', name: 'Дата', type: 'date', options: [] },
                { key: 'minutes', name: 'Минут', type: 'number', options: [] },
                { key: 'hours', name: 'Часов', type: 'formula', options: [], formula: { op: '*', a: { type: 'field', key: 'minutes' }, b: { type: 'const', value: 1 / 60 } } },
              ],
              statuses: [{ name: 'Открыт', color: 'red' }],
            },
          ],
          fromProject: null,
        },
      }),
    })).json()
    expect(created.payload.stageNames).toEqual(['Диагностика', 'Отчёт'])

    // Разворачивание: этапы/домены/разделы/гайды с перевязкой showIf/реестр с формулой.
    const project = await (await app.request('/api/projects/from-template', {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        templateId: created.id,
        name: 'Экспресс, Казань',
        client: 'ООО «Завод»',
        city: 'Казань',
        shops: ['Цех 1'],
      }),
    })).json()
    expect(project).toMatchObject({ name: 'Экспресс, Казань', client: 'ООО «Завод»', city: 'Казань', shops: ['Цех 1'] })
    expect(project.settings.findingCategories).toEqual(['Процесс'])
    expect(project.settings.passportFields).toEqual([{ id: 'pf-1', name: 'Численность', type: 'number' }])

    const groups = await (await app.request(`/api/projects/${project.id}/domain-groups`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(groups.items[0].domains[0].checklist.map((item: { text: string }) => item.text)).toEqual(['Путь заказа', 'Где теряется информация'])
    expect(groups.items[0].domains[0].status).toBe('not_started')

    const stages = await (await app.request(`/api/projects/${project.id}/stages`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(stages.items.map((stage: { name: string }) => stage.name)).toEqual(['Диагностика', 'Отчёт'])
    expect(stages.items[1].milestone).toBe(true)

    const guides = await (await app.request(`/api/projects/${project.id}/guides`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    const questions = guides.items[0].sections[0].questions
    expect(questions[1].showIfQuestionId).toBe(questions[0].id)
    expect(questions[1].showIfValue).toBe('no')

    const registries = await (await app.request(`/api/projects/${project.id}/registries`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(registries.items[0].fields.map((field: { key: string }) => field.key)).toEqual(['date', 'minutes', 'hours'])
    expect(registries.items[0].statuses[0]).toMatchObject({ name: 'Открыт', color: 'red' })

    const report = await (await app.request(`/api/projects/${project.id}/report`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(report.sections.map((section: { title: string }) => section.title)).toEqual(['1. Сводка наблюдений', '2. Быстрые улучшения'])

    // Снимок: прогресс и записи не копируются, showIfClientRefId = id вопросов источника.
    await app.request(`/api/projects/${project.id}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Запись не для шаблона' }),
    })
    await app.request(`/api/registries/${registries.items[0].id}/entries`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ values: { date: '2026-10-01', minutes: 30 } }),
    })
    await app.request(`/api/projects/${project.id}/report/sections`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: '3. Добавленный раздел' }),
    })

    const snapshot = await (await app.request(`/api/projects/${project.id}/to-template`, {
      method: 'POST',
      headers: jsonHeaders(owner.accessToken),
      body: JSON.stringify({ name: 'Шаблон: Экспресс, Казань', description: 'Снимок' }),
    })).json()
    expect(snapshot.payload.fromProject).toBe('Экспресс, Казань')
    expect(snapshot.payload.reportSections).toEqual(['1. Сводка наблюдений', '2. Быстрые улучшения', '3. Добавленный раздел'])
    expect(snapshot.payload.guides[0].sections[0].questions[1].showIfClientRefId).toBe(
      snapshot.payload.guides[0].sections[0].questions[0].clientRefId,
    )
    expect(snapshot.payload.registries[0].fields).toHaveLength(3)
    // Снимок разворачивается обратно без ошибок.
    const roundTrip = await (await app.request('/api/projects/from-template', {
      method: 'POST',
      headers: jsonHeaders(owner.accessToken),
      body: JSON.stringify({ templateId: snapshot.id, name: 'Экспресс, круглый путь' }),
    })).json()
    expect(roundTrip.name).toBe('Экспресс, круглый путь')

    // Удаление шаблона — owner.
    expect((await app.request(`/api/project-templates/${snapshot.id}`, {
      method: 'DELETE',
      headers: authHeaders(owner.accessToken),
    })).status).toBe(204)
  })
})

async function registerAs(prisma: DbClient, app: App, email: string, orgRole: string): Promise<Session> {
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password-1234' }),
  })
  expect(response.status).toBe(201)
  const session = (await response.json()) as Session
  if (orgRole !== 'client') {
    await prisma.user.update({ where: { id: session.user.id }, data: { orgRole: orgRole as never } })
  }
  return session
}

async function createProject(app: App, session: Session, extra: Record<string, unknown> = {}) {
  const response = await app.request('/api/projects', {
    method: 'POST',
    headers: jsonHeaders(session.accessToken),
    body: JSON.stringify({
      name: extra.name ?? 'ЖБИ-завод, Уфа',
      client: 'ООО «Завод ЖБИ»',
      template,
      ...extra,
    }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { id: string }).id
}

async function addMember(app: App, manager: Session, projectId: string, userId: string, role: string) {
  return app.request(`/api/projects/${projectId}/members`, {
    method: 'POST',
    headers: jsonHeaders(manager.accessToken),
    body: JSON.stringify({ userId, role }),
  })
}

async function firstDomainId(app: App, session: Session, projectId: string) {
  const groups = await (await app.request(`/api/projects/${projectId}/domain-groups`, {
    headers: authHeaders(session.accessToken),
  })).json()
  return groups.items[0].domains[0].id as string
}

async function requestSchemeTicket(
  app: App,
  session: Session,
  processId: string,
  side: 'asis' | 'tobe',
  contentType: string,
  body: Buffer,
) {
  const response = await app.request(`/api/processes/${processId}/schemes/${side}/upload-request`, {
    method: 'POST',
    headers: jsonHeaders(session.accessToken),
    body: JSON.stringify({ contentType, byteSize: body.byteLength }),
  })
  expect(response.status).toBe(201)
  return (await response.json()).upload as {
    token: string
    url: string
    headers: Record<string, string>
  }
}

/** Ключ объекта живёт в пути подписанного URL: /storage/objects/<key>?x-op=… */
function objectKeyFromUrl(url: string) {
  const pathname = new URL(url, 'http://127.0.0.1').pathname
  const prefix = '/storage/objects/'
  if (!pathname.startsWith(prefix)) throw new Error(`Unexpected storage URL: ${url}`)
  return pathname
    .slice(prefix.length)
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/')
}

/** Удаление объекта отложено после ответа — опрашиваем, а не предполагаем. */
async function waitForDeletion(storage: FilesystemPrivateStorage, objectKey: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await storage.headObject(objectKey)) === null) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Storage object ${objectKey} was never deleted`)
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

function jsonHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}
