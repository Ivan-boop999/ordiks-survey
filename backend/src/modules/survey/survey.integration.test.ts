import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from '../../app'
import { createPrisma, type DbClient } from '../../db'
import { loadEnv } from '../../env'
import { privateStorageConfigFromEnv, type FilesystemStorageConfig } from '../../storage/config'
import { createFilesystemStorageRoutes } from '../../storage/filesystem-routes'
import { FilesystemPrivateStorage } from '../../storage/filesystem-storage'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required; run bun run test:backend:integration')

const template = {
  stageNames: ['Подготовка'],
  groups: ['Производство'],
  domains: [{ groupIndex: 0, name: 'Планирование: цех плит', checklist: ['Вход: заказы'] }],
}

type Session = { accessToken: string; user: { id: string; email: string } }
type App = ReturnType<typeof createApp>

describe('survey API integration (facts, guides, interviews, requests, findings)', () => {
  const env = loadEnv({
    DATABASE_URL: databaseUrl,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: 'http://localhost:5173',
    ACCESS_TOKEN_TTL_SECONDS: '60',
    // Много запросов подряд в одном файле; бюджет по умолчанию (60/мин) не хватает.
    AUTH_RATE_LIMIT_MAX: '1000',
  })
  const prisma = createPrisma(databaseUrl)
  let root: string
  let storage: FilesystemPrivateStorage
  let app: App

  beforeEach(async () => {
    await prisma.invite.deleteMany()
    await prisma.project.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.passwordResetToken.deleteMany()
    await prisma.user.deleteMany()

    root = await mkdtemp(join(tmpdir(), 'survey-integration-'))
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

  test('facts: team CRUD with filters and search; client reads but cannot write; observer reads', async () => {
    const analyst = await registerAs(prisma, app, 'facts-analyst@ordiks.ru', 'analyst')
    // Справочник типов фактов с кастомным «Показания прибора» (kind note), как в демо-проекте.
    const projectId = await createProject(app, analyst, {
      settings: {
        factTypes: [
          { key: 'photo', name: 'Фото', kind: 'photo', icon: 'image', color: 'purple' },
          { key: 'file', name: 'Файл', kind: 'file', icon: 'file', color: 'blue' },
          { key: 'note', name: 'Заметка', kind: 'note', icon: 'note', color: 'gray' },
          { key: 'gauge', name: 'Показания прибора', kind: 'note', icon: 'metric', color: 'green' },
        ],
      },
    })
    const manager = await registerAs(prisma, app, 'facts-manager@ordiks.ru', 'manager')
    const client = await registerAs(prisma, app, 'facts-client@demo.ordiks.ru', 'client')
    const observer = await registerAs(prisma, app, 'facts-observer@demo.ordiks.ru', 'client')
    expect((await addMember(app, manager, projectId, client.user.id, 'client_lead')).status).toBe(201)
    expect((await addMember(app, manager, projectId, observer.user.id, 'observer')).status).toBe(201)

    const domainId = await firstDomainId(app, analyst, projectId)

    // Клиент не создаёт и не правит факты.
    expect((await app.request(`/api/projects/${projectId}/facts`, {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ kind: 'note', title: 'Свой факт' }),
    })).status).toBe(403)

    const note = await (await app.request(`/api/projects/${projectId}/facts`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        kind: 'note',
        title: 'Двойной ввод отгрузки',
        description: '1С и таблица логиста',
        shop: 'Отдел продаж',
        domainId,
      }),
    })).json()
    expect(note).toMatchObject({ kind: 'note', typeKey: 'note', shop: 'Отдел продаж', domainId, objectKey: null, findings: [] })

    const gauge = await (await app.request(`/api/projects/${projectId}/facts`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ kind: 'note', typeKey: 'gauge', title: 'Наработка', description: '' }),
    })).json()
    expect(gauge.typeKey).toBe('gauge')

    await app.request(`/api/projects/${projectId}/facts`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ kind: 'photo', title: 'Журнал смены', description: 'В конце смены', shop: 'Цех плит', domainId }),
    })
    await app.request(`/api/projects/${projectId}/facts`, {
      method: 'POST',
      headers: jsonHeaders(manager.accessToken),
      body: JSON.stringify({ kind: 'file', title: 'Выгрузка 1С', fileName: 'otgruzki_12m.xls' }),
    })

    // typeKey не из справочника и несоответствие kind — 400.
    expect((await app.request(`/api/projects/${projectId}/facts`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ kind: 'note', typeKey: 'unknown', title: 'Нет такого типа' }),
    })).status).toBe(400)
    expect((await app.request(`/api/projects/${projectId}/facts`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ kind: 'photo', typeKey: 'gauge', title: 'Заметка как фото' }),
    })).status).toBe(400)

    // Фильтры: kind + домен + поиск по title/description.
    const byKind = await (await app.request(`/api/projects/${projectId}/facts?kind=note`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(byKind.items.map((fact: { id: string }) => fact.id).sort()).toEqual([note.id, gauge.id].sort())

    const bySearch = await (await app.request(`/api/projects/${projectId}/facts?q=ввод`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(bySearch.items.map((fact: { id: string }) => fact.id)).toEqual([note.id])

    const byDomain = await (await app.request(`/api/projects/${projectId}/facts?domainId=${domainId}`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(byDomain.items).toHaveLength(2)

    // Клиент и наблюдатель читают; наблюдатель не правит.
    expect((await app.request(`/api/projects/${projectId}/facts`, { headers: authHeaders(client.accessToken) })).status).toBe(200)
    expect((await app.request(`/api/facts/${note.id}`, { headers: authHeaders(observer.accessToken) })).status).toBe(200)
    expect((await app.request(`/api/facts/${note.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(observer.accessToken),
      body: JSON.stringify({ title: 'Никак' }),
    })).status).toBe(403)

    const updated = await (await app.request(`/api/facts/${note.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Двойной ввод отгрузки (обновлено)' }),
    })).json()
    expect(updated.title).toBe('Двойной ввод отгрузки (обновлено)')

    // Посторонний не отличает чужой факт от отсутствующего.
    const outsider = await registerAs(prisma, app, 'facts-outsider@demo.ordiks.ru', 'client')
    expect((await app.request(`/api/facts/${note.id}`, { headers: authHeaders(outsider.accessToken) })).status).toBe(404)

    expect((await app.request(`/api/facts/${gauge.id}`, { method: 'DELETE', headers: authHeaders(analyst.accessToken) })).status).toBe(204)
    expect((await app.request(`/api/facts/${gauge.id}`, { headers: authHeaders(analyst.accessToken) })).status).toBe(404)
  })

  test('fact files: ticket → PUT → confirm → download for every role, replace and delete clean up', async () => {
    const analyst = await registerAs(prisma, app, 'file-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst)
    const manager = await registerAs(prisma, app, 'file-manager@ordiks.ru', 'manager')
    const client = await registerAs(prisma, app, 'file-client@demo.ordiks.ru', 'client')
    expect((await addMember(app, manager, projectId, client.user.id, 'client_staff')).status).toBe(201)

    const fact = await (await app.request(`/api/projects/${projectId}/facts`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ kind: 'photo', title: 'Журнал смены, цех плит', description: 'демо-фото' }),
    })).json()

    const ticket = await requestFactTicket(app, analyst, fact.id, 'image/png', pngBytes)
    // Подтверждение до загрузки — 409 UPLOAD_NOT_COMPLETED.
    const premature = await app.request(`/api/facts/${fact.id}/file/confirm`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ token: ticket.token, fileName: 'journal.png' }),
    })
    expect(premature.status).toBe(409)
    expect((await premature.json()).error.code).toBe('UPLOAD_NOT_COMPLETED')

    expect((await app.request(ticket.url, {
      method: 'PUT',
      headers: ticket.headers,
      body: new Uint8Array(pngBytes),
    })).status).toBe(200)

    const confirmed = await (await app.request(`/api/facts/${fact.id}/file/confirm`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ token: ticket.token, fileName: 'журнал-смены.png' }),
    })).json()
    expect(confirmed.objectKey).toMatch(new RegExp(`^projects/${projectId}/facts/`))
    expect(confirmed.fileName).toBe('журнал-смены.png')

    // Клиент не загружает, но скачивает (view); посторонний — 404.
    expect((await app.request(`/api/facts/${fact.id}/file/upload-request`, {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ contentType: 'image/png', byteSize: 64 }),
    })).status).toBe(403)

    const clientDownload = await (await app.request(`/api/facts/${fact.id}/file/download`, {
      headers: authHeaders(client.accessToken),
    })).json()
    expect((await app.request(clientDownload.url)).status).toBe(200)
    expect(Buffer.from(await (await app.request(clientDownload.url)).arrayBuffer())).toEqual(pngBytes)

    const outsider = await registerAs(prisma, app, 'file-outsider@demo.ordiks.ru', 'client')
    expect((await app.request(`/api/facts/${fact.id}/file/download`, { headers: authHeaders(outsider.accessToken) })).status).toBe(404)

    // Поддельный токен и чужой факт — не проходят.
    expect((await app.request(`/api/facts/${fact.id}/file/confirm`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ token: 'v1.forged.sig', fileName: 'x.png' }),
    })).status).toBe(410)

    // Размер в хранилище не совпал с объявленным: подтверждение отвергает и чистит объект.
    const sizeTicket = await requestFactTicket(app, analyst, fact.id, 'image/png', pngBytes)
    const sizeKey = objectKeyFromUrl(sizeTicket.url)
    await storage.putObjectOnce(sizeKey, new Uint8Array(pngBytes.subarray(0, 20)), 'image/png')
    const mismatched = await app.request(`/api/facts/${fact.id}/file/confirm`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ token: sizeTicket.token, fileName: 'short.png' }),
    })
    expect(mismatched.status).toBe(409)
    expect((await mismatched.json()).error.code).toBe('UPLOAD_REJECTED')

    // Замена файла: старый объект удаляется, новый раздаётся.
    const replacement = await requestFactTicket(app, analyst, fact.id, 'image/png', otherPngBytes)
    await app.request(replacement.url, {
      method: 'PUT',
      headers: replacement.headers,
      body: new Uint8Array(otherPngBytes),
    })
    const oldKey = confirmed.objectKey
    const replaced = await (await app.request(`/api/facts/${fact.id}/file/confirm`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ token: replacement.token, fileName: 'journal-2.png' }),
    })).json()
    expect(replaced.objectKey).not.toBe(oldKey)
    await waitForDeletion(storage, oldKey)

    const newDownload = await (await app.request(`/api/facts/${fact.id}/file/download`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(Buffer.from(await (await app.request(newDownload.url)).arrayBuffer())).toEqual(otherPngBytes)

    // Удаление файла отвязывает объект; скачивание — 404; сам факт остаётся.
    const secondKey = replaced.objectKey
    const cleared = await (await app.request(`/api/facts/${fact.id}/file`, {
      method: 'DELETE',
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(cleared.objectKey).toBeNull()
    await waitForDeletion(storage, secondKey)
    expect((await app.request(`/api/facts/${fact.id}/file/download`, { headers: authHeaders(analyst.accessToken) })).status).toBe(404)
    expect((await app.request(`/api/facts/${fact.id}`, { headers: authHeaders(analyst.accessToken) })).status).toBe(200)
  })

  test('guides: conditional questions, duplicate with rebind, ordering; client cannot edit', async () => {
    const analyst = await registerAs(prisma, app, 'guides-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst)
    const manager = await registerAs(prisma, app, 'guides-manager@ordiks.ru', 'manager')
    const client = await registerAs(prisma, app, 'guides-client@demo.ordiks.ru', 'client')
    expect((await addMember(app, manager, projectId, client.user.id, 'client_lead')).status).toBe(201)

    const ynRef = '019c0000-0000-7000-8000-000000000001'
    const guide = await (await app.request(`/api/projects/${projectId}/guides`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        name: 'Опросник: планирование производства',
        sections: [
          {
            title: 'Текущий процесс',
            questions: [
              { id: ynRef, type: 'yn', text: 'План фиксируется в единой системе?' },
              { type: 'text', text: 'Если нет — где живёт план?', showIfQuestionId: ynRef, showIfValue: 'no' },
              { type: 'text', text: 'Как заказ превращается в план?' },
            ],
          },
        ],
      }),
    })).json()

    // showIf перевязан на новый id yn-вопроса; условие ссылается назад по дереву.
    const ynId = guide.sections[0].questions[0].id
    const conditional = guide.sections[0].questions[1]
    expect(conditional.showIfQuestionId).toBe(ynId)
    expect(conditional.showIfValue).toBe('no')
    expect(conditional.id).not.toBe(ynRef)

    // Клиент читает, но не правит.
    expect((await app.request(`/api/projects/${projectId}/guides`, { headers: authHeaders(client.accessToken) })).status).toBe(200)
    expect((await app.request(`/api/projects/${projectId}/guides`, {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ name: 'Свой' }),
    })).status).toBe(403)

    // Вопросы: добавление, порядок, смена типа; условие на несуществующий/сам условный вопрос — 400.
    const sectionId = guide.sections[0].id
    const added = await (await app.request(`/api/guide-sections/${sectionId}/questions`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ type: 'multi', text: 'Где живёт план сегодня?', options: ['Excel', '1С', 'Бумага'] }),
    })).json()
    expect(added.sections[0].questions).toHaveLength(4)
    expect(added.sections[0].questions[3].sortOrder).toBe(3)

    expect((await app.request(`/api/guide-sections/${sectionId}/questions`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ type: 'yn', text: 'Источник не существует?', showIfQuestionId: '019c0000-0000-7000-8000-00000000dead', showIfValue: 'yes' }),
    })).status).toBe(400)
    // Цепочка условий запрещена: источник сам условный.
    expect((await app.request(`/api/guide-sections/${sectionId}/questions`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ type: 'text', text: 'Продолжение условного?', showIfQuestionId: conditional.id, showIfValue: 'нет' }),
    })).status).toBe(400)
    expect((await app.request(`/api/guide-sections/${sectionId}/questions`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ type: 'choice', text: 'Без вариантов?' }),
    })).status).toBe(400)

    // Порядок вопросов: безусловный вопрос уезжает в конец уникальным sortOrder.
    const moved = await (await app.request(`/api/guide-questions/${added.sections[0].questions[2].id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ sortOrder: 10 }),
    })).json()
    expect(moved.sections[0].questions.map((question: { text: string }) => question.text)).toEqual([
      'План фиксируется в единой системе?',
      'Если нет — где живёт план?',
      'Где живёт план сегодня?',
      'Как заказ превращается в план?',
    ])

    // Дубль: новые id, showIf перевязаны, имя с пометкой.
    const copy = await (await app.request(`/api/guides/${guide.id}/duplicate`, {
      method: 'POST',
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(copy.name).toBe('Опросник: планирование производства (копия)')
    expect(copy.id).not.toBe(guide.id)
    const copyYn = copy.sections[0].questions[0]
    const copyConditional = copy.sections[0].questions[1]
    expect(copyConditional.showIfQuestionId).toBe(copyYn.id)
    expect(copyConditional.showIfValue).toBe('no')

    // Переименование и удаление.
    const renamed = await (await app.request(`/api/guides/${guide.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ name: 'Опросник: планирование (v2)' }),
    })).json()
    expect(renamed.name).toBe('Опросник: планирование (v2)')
    expect((await app.request(`/api/guides/${copy.id}`, { method: 'DELETE', headers: authHeaders(analyst.accessToken) })).status).toBe(204)

    // Удаление вопроса-источника: зависимые показываются безусловно (SetNull).
    expect((await app.request(`/api/guide-questions/${ynId}`, { method: 'DELETE', headers: authHeaders(analyst.accessToken) })).status).toBe(204)
    const afterDelete = await (await app.request(`/api/guides/${guide.id}`, { headers: authHeaders(analyst.accessToken) })).json()
    expect(afterDelete.sections[0].questions.find((question: { text: string }) => question.text === 'Если нет — где живёт план?').showIfQuestionId).toBeNull()
  })

  test('interviews: answers validate by guide, conditional dropped, full replace', async () => {
    const analyst = await registerAs(prisma, app, 'iv-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst)
    const manager = await registerAs(prisma, app, 'iv-manager@ordiks.ru', 'manager')
    const client = await registerAs(prisma, app, 'iv-client@demo.ordiks.ru', 'client')
    expect((await addMember(app, manager, projectId, client.user.id, 'client_lead')).status).toBe(201)

    const guide = await (await app.request(`/api/projects/${projectId}/guides`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        name: 'Опросник: планирование',
        sections: [{
          title: 'Текущий процесс',
          questions: [
            { id: '019c0000-0000-7000-8000-000000000001', type: 'yn', text: 'План фиксируется в единой системе?' },
            { type: 'text', text: 'Если нет — где живёт план?', showIfQuestionId: '019c0000-0000-7000-8000-000000000001', showIfValue: 'no' },
            { type: 'scale', text: 'Насколько стабилен план месяца? (1–5)' },
            { type: 'choice', text: 'Срочные заказы?', options: ['Вытесняют план', 'Вставляются в окна'] },
            { type: 'multi', text: 'Где живёт план?', options: ['Excel', '1С', 'Бумага'] },
          ],
        }],
      }),
    })).json()
    const questions = guide.sections[0].questions
    expect(questions).toHaveLength(5)
    expect(questions[1].showIfQuestionId).toBe(questions[0].id)

    const domainId = await firstDomainId(app, analyst, projectId)
    const interview = await (await app.request(`/api/projects/${projectId}/interviews`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        scheduledAt: '2026-10-09T14:00:00.000Z',
        respondent: 'Марат Хайруллин',
        respondentRole: 'Начальник цеха плит',
        domainId,
        guideId: guide.id,
        notes: 'План месяца — в Excel у ПДО.',
      }),
    })).json()
    expect(interview).toMatchObject({ status: 'planned', respondent: 'Марат Хайруллин', answers: [] })

    // Клиент не сохраняет ответы.
    expect((await app.request(`/api/interviews/${interview.id}/answers`, {
      method: 'PUT',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ answers: [] }),
    })).status).toBe(403)

    // Ответы с невыполненным условием: yn=yes → условный текст отброшен.
    const first = await (await app.request(`/api/interviews/${interview.id}/answers`, {
      method: 'PUT',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        answers: [
          { questionId: questions[0].id, value: 'yes' },
          { questionId: questions[1].id, value: 'В единой системе' },
          { questionId: questions[2].id, value: 3 },
          { questionId: questions[3].id, value: 'Вставляются в окна' },
          { questionId: questions[4].id, value: ['1С'] },
        ],
      }),
    })).json()
    expect(first.saved).toBe(4)
    expect(first.interview.answers.map((answer: { questionId: string }) => answer.questionId)).not.toContain(questions[1].id)
    expect(first.interview.answers.find((answer: { questionId: string }) => answer.questionId === questions[2].id).value).toBe('3')

    // Полная замена: yn=no → условный сохраняется; пустые/null — нет.
    const second = await (await app.request(`/api/interviews/${interview.id}/answers`, {
      method: 'PUT',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        answers: [
          { questionId: questions[0].id, value: 'no' },
          { questionId: questions[1].id, value: 'План месяца — в Excel у ПДО, сменные задания — на бумаге.' },
          { questionId: questions[2].id, value: null },
          { questionId: questions[3].id, value: 'Вытесняют план' },
          { questionId: questions[4].id, value: ['Excel', 'Бумага'] },
        ],
      }),
    })).json()
    expect(second.saved).toBe(4)
    const savedIds = second.interview.answers.map((answer: { questionId: string }) => answer.questionId)
    expect(savedIds).toContain(questions[1].id)
    expect(savedIds).not.toContain(questions[2].id)
    expect(second.interview.answers).toHaveLength(4)

    // Неверный тип значения — 400.
    expect((await app.request(`/api/interviews/${interview.id}/answers`, {
      method: 'PUT',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ answers: [{ questionId: questions[0].id, value: 'может быть' }] }),
    })).status).toBe(400)
    expect((await app.request(`/api/interviews/${interview.id}/answers`, {
      method: 'PUT',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ answers: [{ questionId: '019c0000-0000-7000-8000-00000000dead', value: 'x' }] }),
    })).status).toBe(400)

    // Правка статуса/конспекта командой; фильтр по статусу.
    await app.request(`/api/interviews/${interview.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ status: 'done' }),
    })
    const doneList = await (await app.request(`/api/projects/${projectId}/interviews?status=done`, {
      headers: authHeaders(client.accessToken),
    })).json()
    expect(doneList.items).toHaveLength(1)
    const plannedList = await (await app.request(`/api/projects/${projectId}/interviews?status=planned`, {
      headers: authHeaders(client.accessToken),
    })).json()
    expect(plannedList.items).toHaveLength(0)

    expect((await app.request(`/api/interviews/${interview.id}`, { method: 'DELETE', headers: authHeaders(analyst.accessToken) })).status).toBe(204)
  })

  test('requests: overdue on the fly; client roles change status, observer cannot', async () => {
    const analyst = await registerAs(prisma, app, 'req-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst)
    const manager = await registerAs(prisma, app, 'req-manager@ordiks.ru', 'manager')
    const client = await registerAs(prisma, app, 'req-client@demo.ordiks.ru', 'client')
    const observer = await registerAs(prisma, app, 'req-observer@demo.ordiks.ru', 'client')
    expect((await addMember(app, manager, projectId, client.user.id, 'client_staff')).status).toBe(201)
    expect((await addMember(app, manager, projectId, observer.user.id, 'observer')).status).toBe(201)

    const domainId = await firstDomainId(app, analyst, projectId)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Клиент не создаёт и не правит поля запроса.
    expect((await app.request(`/api/projects/${projectId}/requests`, {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ what: 'Свой запрос' }),
    })).status).toBe(403)

    const overdue = await (await app.request(`/api/projects/${projectId}/requests`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        what: 'Реестр оборудования с инвентарными номерами',
        why: 'База для анализа ТОиР',
        domainId,
        assigneeId: client.user.id,
        deadline: yesterday,
      }),
    })).json()
    expect(overdue).toMatchObject({ status: 'requested', overdue: true, receivedAt: null })

    const future = await (await app.request(`/api/projects/${projectId}/requests`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ what: 'Схема сети и список серверов', deadline: nextWeek }),
    })).json()
    expect(future.overdue).toBe(false)

    // Ответственный — не участник: 400.
    const outsider = await registerAs(prisma, app, 'req-outsider@demo.ordiks.ru', 'client')
    expect((await app.request(`/api/projects/${projectId}/requests`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ what: 'Плохой ответственный', assigneeId: outsider.user.id }),
    })).status).toBe(400)

    // Наблюдатель не отвечает; клиент меняет статус — ключевой сценарий портала.
    expect((await app.request(`/api/requests/${overdue.id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(observer.accessToken),
      body: JSON.stringify({ status: 'in_progress' }),
    })).status).toBe(403)

    const inProgress = await (await app.request(`/api/requests/${overdue.id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ status: 'in_progress' }),
    })).json()
    expect(inProgress).toMatchObject({ status: 'in_progress', overdue: true })

    const received = await (await app.request(`/api/requests/${overdue.id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ status: 'received' }),
    })).json()
    expect(received.status).toBe('received')
    expect(received.receivedAt).not.toBeNull()
    // received гасит просрочку даже с прошедшим дедлайном.
    expect(received.overdue).toBe(false)

    // Возврат в работу сбрасывает receivedAt и снова делает просроченным.
    const reopened = await (await app.request(`/api/requests/${overdue.id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ status: 'requested' }),
    })).json()
    expect(reopened).toMatchObject({ overdue: true, receivedAt: null })

    // Фильтр overdue=true отдаёт только просроченные.
    const overdueOnly = await (await app.request(`/api/projects/${projectId}/requests?overdue=true`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(overdueOnly.items.map((request: { id: string }) => request.id)).toEqual([overdue.id])
    const notOverdue = await (await app.request(`/api/projects/${projectId}/requests?overdue=false`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(notOverdue.items.map((request: { id: string }) => request.id)).toEqual([future.id])

    // Посторонний не видит запроса; правка полей — только команда.
    expect((await app.request(`/api/requests/${overdue.id}`, { headers: authHeaders(outsider.accessToken) })).status).toBe(404)
    expect((await app.request(`/api/requests/${overdue.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ what: 'Переписать' }),
    })).status).toBe(403)
    const edited = await (await app.request(`/api/requests/${overdue.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ what: 'Реестр оборудования (обновлено)', deadline: nextWeek }),
    })).json()
    expect(edited).toMatchObject({ what: 'Реестр оборудования (обновлено)', overdue: false })
  })

  test('findings: dictionary validation with defaults, links, filters, and team-only bulk', async () => {
    const analyst = await registerAs(prisma, app, 'fd-analyst@ordiks.ru', 'analyst')
    const projectId = await createProject(app, analyst)
    const manager = await registerAs(prisma, app, 'fd-manager@ordiks.ru', 'manager')
    const client = await registerAs(prisma, app, 'fd-client@demo.ordiks.ru', 'client')
    // Менеджер — участник проекта: он же целевой владелец находки.
    expect((await addMember(app, manager, projectId, manager.user.id, 'manager')).status).toBe(201)
    expect((await addMember(app, manager, projectId, client.user.id, 'client_lead')).status).toBe(201)

    const domainId = await firstDomainId(app, analyst, projectId)
    const fact = await (await app.request(`/api/projects/${projectId}/facts`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ kind: 'note', title: 'Двойной ввод отгрузки', description: '1С + таблица' }),
    })).json()

    // Дефолты из справочника применяются при создании.
    const finding = await (await app.request(`/api/projects/${projectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({
        title: 'Двойной ввод отгрузок',
        description: 'Расхождения разбирают по телефону.',
        domainId,
        factId: fact.id,
        ownerId: analyst.user.id,
      }),
    })).json()
    expect(finding).toMatchObject({ category: 'Процесс', priority: 'Средний', status: 'registered', factId: fact.id })

    // Дефолтная тройка есть в DTO факта — «спросить findingId у факта».
    const factWithFindings = await (await app.request(`/api/facts/${fact.id}`, { headers: authHeaders(analyst.accessToken) })).json()
    expect(factWithFindings.findings.map((linked: { id: string }) => linked.id)).toEqual([finding.id])

    // Справочники: значения не из settings — 400; кастомный статус проекта проходит.
    expect((await app.request(`/api/projects/${projectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Плохая категория', category: 'Юридическое' }),
    })).status).toBe(400)
    expect((await app.request(`/api/projects/${projectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Плохой приоритет', priority: 'Мгновенно' }),
    })).status).toBe(400)

    const custom = await (await app.request(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ settings: { findingStatuses: [{ id: 'escalated', name: 'Эскалация', color: 'red' }] } }),
    })).json()
    expect(custom.settings.findingStatuses.map((status: { id: string }) => status.id)).toEqual(['escalated'])

    const escalated = await (await app.request(`/api/projects/${projectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ title: 'Склад без адресации', status: 'escalated', priority: 'Высокий', domainId }),
    })).json()
    expect(escalated.status).toBe('escalated')

    // Клиент не создаёт и не делает bulk; читает и видит фильтры.
    expect((await app.request(`/api/projects/${projectId}/findings`, {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ title: 'Своя проблема' }),
    })).status).toBe(403)
    expect((await app.request(`/api/projects/${projectId}/findings/bulk`, {
      method: 'POST',
      headers: jsonHeaders(client.accessToken),
      body: JSON.stringify({ ids: [finding.id], status: 'escalated' }),
    })).status).toBe(403)

    const byPriority = await (await app.request(`/api/projects/${projectId}/findings?priority=Высокий`, {
      headers: authHeaders(client.accessToken),
    })).json()
    expect(byPriority.items.map((item: { id: string }) => item.id)).toEqual([escalated.id])

    // Bulk: только команда, статус из справочника, чужие id пропускаются.
    expect((await app.request(`/api/projects/${projectId}/findings/bulk`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ ids: [finding.id], status: 'confirmed' }),
    })).status).toBe(400)

    const bulk = await (await app.request(`/api/projects/${projectId}/findings/bulk`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ ids: [finding.id, escalated.id, '019c0000-0000-7000-8000-00000000dead'], status: 'escalated' }),
    })).json()
    expect(bulk).toEqual({ updated: 2 })

    const afterBulk = await (await app.request(`/api/projects/${projectId}/findings?status=escalated`, {
      headers: authHeaders(analyst.accessToken),
    })).json()
    expect(afterBulk.items).toHaveLength(2)

    // Владелец — только участник проекта; связь факта — только из этого проекта.
    expect((await app.request(`/api/findings/${finding.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ ownerId: manager.user.id }),
    })).status).toBe(200)
    const outsider = await registerAs(prisma, app, 'fd-outsider@demo.ordiks.ru', 'client')
    expect((await app.request(`/api/findings/${finding.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ ownerId: outsider.user.id }),
    })).status).toBe(400)

    const otherProjectId = await createProject(app, analyst, { name: 'Чужой проект' })
    const otherFact = await (await app.request(`/api/projects/${otherProjectId}/facts`, {
      method: 'POST',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ kind: 'note', title: 'Факт чужого проекта' }),
    })).json()
    expect((await app.request(`/api/findings/${finding.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(analyst.accessToken),
      body: JSON.stringify({ factId: otherFact.id }),
    })).status).toBe(400)

    expect((await app.request(`/api/findings/${escalated.id}`, { method: 'DELETE', headers: authHeaders(analyst.accessToken) })).status).toBe(204)
    expect((await app.request(`/api/findings/${escalated.id}`, { headers: authHeaders(analyst.accessToken) })).status).toBe(404)
  })
})

const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 0x20),
])
const otherPngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]),
  Buffer.alloc(48, 0x30),
])

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

async function requestFactTicket(app: App, session: Session, factId: string, contentType: string, body: Buffer) {
  const response = await app.request(`/api/facts/${factId}/file/upload-request`, {
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
