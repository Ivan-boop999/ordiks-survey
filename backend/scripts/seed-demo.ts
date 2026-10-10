import 'dotenv/config'

import type { MemberRole, OrgRole, StageStatus, TaskStatus } from '@ordiks-survey/contracts'

import { createPrisma, type DbClient } from '../src/db'

/**
 * Демо-сид «Ордикс Обследование»: команда ОРДИКС, клиентские пользователи и проект
 * «ЖБИ-завод, Уфа» с этапами, доменами и чек-листами из кликабельного прототипа
 * (seedDemoState): тот же прогресс покрытия и те же задачи. Гайды, интервью, факты,
 * находки и процессы придут следующими волнами — здесь только то, что уже в схеме.
 *
 * Защита: запускается только при DEMO_SEED_ALLOWED=1 (осознанное решение владельца;
 * так делает и корневой Dockerfile). Идемпотентен: пользователи и члены — upsert по
 * email, проект — upsert по названию; у существующего проекта обновляется паспорт,
 * но прогресс (этапы/домены/задачи) не трогается.
 *
 * Пароли: DEMO_SEED_PASSWORD (по умолчанию `ordiks-demo`, 8+ символов) для всех
 * демо-аккаунтов; тестовый инвайт — код UFA-2026.
 */

const DEMO_PROJECT_NAME = 'ЖБИ-завод, Уфа'
const DEMO_INVITE_CODE = 'UFA-2026'
const DEFAULT_DEMO_PASSWORD = 'ordiks-demo'

type DemoUser = {
  email: string
  displayName: string
  orgRole: OrgRole
}

const demoUsers: DemoUser[] = [
  { email: 'ivan@ordiks.ru', displayName: 'Иван Заболотный', orgRole: 'owner' },
  { email: 'anna@ordiks.ru', displayName: 'Анна Ковалёва', orgRole: 'manager' },
  { email: 'rustem@demo.ordiks.ru', displayName: 'Рустем Гареев', orgRole: 'client' },
  { email: 'marat@demo.ordiks.ru', displayName: 'Марат Хайруллин', orgRole: 'client' },
  { email: 'olga@demo.ordiks.ru', displayName: 'Ольга Смирнова', orgRole: 'client' },
  { email: 'sergey@demo.ordiks.ru', displayName: 'Сергей Панафидин', orgRole: 'client' },
]

const demoMembers: Array<{ email: string; role: MemberRole }> = [
  { email: 'ivan@ordiks.ru', role: 'manager' },
  { email: 'anna@ordiks.ru', role: 'manager' },
  { email: 'rustem@demo.ordiks.ru', role: 'client_lead' },
  { email: 'marat@demo.ordiks.ru', role: 'client_staff' },
  { email: 'olga@demo.ordiks.ru', role: 'client_staff' },
  { email: 'sergey@demo.ordiks.ru', role: 'observer' },
]

const demoShops = [
  'Цех плит', 'Цех ВПИ №1', 'Цех ВПИ №2', 'ПДО', 'ОГМ', 'Лаборатория', 'Склад ГП', 'Отдел продаж', 'Бухгалтерия',
]

const demoPassportFields = [
  { id: 'pf-people', name: 'Численность', type: 'number' as const },
  { id: 'pf-shifts', name: 'Сменный график', type: 'select' as const, opts: ['1 смена', '2 смены', '3 смены'] },
  { id: 'pf-owner', name: 'Собственник', type: 'select' as const, opts: ['частный', 'холдинг', 'государство'] },
]

const demoSettings = {
  findingCategories: ['Процесс', 'Данные', 'Оборудование', 'Организация'],
  findingPriorities: ['Критично', 'Высокий', 'Средний', 'Низкий'],
  findingStatuses: [
    { id: 'registered', name: 'Зарегистрирована', color: 'gray' },
    { id: 'confirmed', name: 'Подтверждена', color: 'blue' },
    { id: 'discussed', name: 'В обсуждении', color: 'purple' },
    { id: 'closed', name: 'Закрыта', color: 'green' },
  ],
  factTypes: [
    { key: 'photo', name: 'Фото', kind: 'photo', icon: 'image', color: 'purple' },
    { key: 'file', name: 'Файл', kind: 'file', icon: 'file', color: 'blue' },
    { key: 'note', name: 'Заметка', kind: 'note', icon: 'note', color: 'gray' },
    { key: 'gauge', name: 'Показания прибора', kind: 'note', icon: 'metric', color: 'green' },
  ],
  passportFields: demoPassportFields,
  passportValues: { 'pf-people': '1200', 'pf-shifts': '2 смены', 'pf-owner': 'холдинг' },
}

/** Дерево доменов ЖБИ из прототипа (zhbiDomainTree): 7 групп, 19 доменов с чек-листами. */
const demoDomainTree: Array<{
  group: string
  domains: Array<{ name: string; checklist: string[]; owner?: string; done?: number }>
}> = [
  {
    group: 'Продажи и заказы',
    domains: [
      { name: 'Продажи и договоры', checklist: ['Как формируется заказ клиента', 'Проверка возможностей и сроков', 'Договор и спецификации', 'Передача заказа в планирование'], owner: 'ivan@ordiks.ru', done: 4 },
      { name: 'Ценообразование', checklist: ['Применяемые прайсы', 'Согласование скидок', 'Связь с себестоимостью'] },
    ],
  },
  {
    group: 'Производство',
    domains: [
      { name: 'Планирование: цех плит', checklist: ['Вход: заказы и портфель', 'Составление плана на месяц/смену', 'Балансировка загрузки форм', 'Изменения плана и приоритеты'], owner: 'anna@ordiks.ru', done: 3 },
      { name: 'Планирование: цех ВПИ №1', checklist: ['Вход: заказы и портфель', 'Сменные задания', 'Загрузка линий', 'Изменения плана'], owner: 'ivan@ordiks.ru', done: 2 },
      { name: 'Планирование: цех ВПИ №2', checklist: ['Вход: заказы и портфель', 'Сменные задания', 'Загрузка линий', 'Изменения плана'] },
      { name: 'Диспетчеризация', checklist: ['Кто и когда сводит факт', 'Оперативные отклонения', 'Движение заказов между цехами'], owner: 'anna@ordiks.ru', done: 1 },
      { name: 'Сырьё и материалы', checklist: ['Нормы расхода', 'Подача к постам', 'Учёт остатков в цехах', 'Контроль качества входного'], owner: 'anna@ordiks.ru', done: 2 },
      { name: 'Фактический выпуск', checklist: ['Фиксация выпуска смены', 'Полуфабрикаты между операциями', 'Брак и его причины', 'Простои'], owner: 'anna@ordiks.ru', done: 2 },
    ],
  },
  {
    group: 'Качество',
    domains: [
      { name: 'ОТК', checklist: ['Контрольные точки', 'Регистрация несоответствий', 'Решения по браку', 'Анализы причин'] },
      { name: 'Лаборатория', checklist: ['Журнал испытаний', 'Графики контроля', 'Паспорта качества', 'Связь с партиями'] },
    ],
  },
  {
    group: 'Склад и логистика',
    domains: [
      { name: 'Склад готовой продукции', checklist: ['Ячейки и адресация', 'Резервирование под заказы', 'Инвентаризации', 'Пересорт'], owner: 'anna@ordiks.ru', done: 1 },
      { name: 'Отгрузка', checklist: ['Сборка отгрузок', 'Документы отгрузки', 'Транспорт', 'Связь с оплатой'] },
    ],
  },
  {
    group: 'Экономика и документы',
    domains: [
      { name: 'Документооборот', checklist: ['Внутренние документы', 'ЭДО с клиентами', 'Архив и поиск'] },
      { name: 'Себестоимость', checklist: ['Статьи затрат', 'Распределение по заказам', 'План-факт затрат', 'Рентабельность изделий'] },
    ],
  },
  {
    group: 'ТОиР и оснастка',
    domains: [
      { name: 'ТОиР и ППР', checklist: ['Реестр оборудования', 'Регламенты обслуживания', 'Наработка', 'Графики ППР', 'История ремонтов'], owner: 'ivan@ordiks.ru', done: 2 },
      { name: 'Оснастка: формы и матрицы', checklist: ['Реестр оснастки', 'Циклы и ресурс', 'Ремонты оснастки', 'Заказы на изготовление'] },
    ],
  },
  {
    group: 'ИТ и автоматизация',
    domains: [
      { name: 'ИТ-системы', checklist: ['Текущие системы и 1С', 'Кто администрирует', 'Обмены между системами', 'Дублирование ввода'], owner: 'anna@ordiks.ru', done: 2 },
      { name: 'АСУ ТП и оборудование на линиях', checklist: ['Контроллеры и SCADA', 'Что уже снимается автоматически', 'Приборы КИПиА', 'Потенциал съёма данных'] },
      { name: 'Инфраструктура', checklist: ['Сети на площадке', 'Серверы', 'Резервирование', 'Доступы снаружи'] },
    ],
  },
]

/** Этапы из прототипа: даты — смещениями в днях от сегодня. */
const demoStages: Array<{
  name: string
  start: number
  end: number
  milestone: boolean
  status: StageStatus
}> = [
  { name: 'Подготовка', start: -21, end: -14, milestone: false, status: 'done' },
  { name: 'Выезд и сбор фактов', start: -3, end: 2, milestone: false, status: 'active' },
  { name: 'Анализ и моделирование', start: 3, end: 17, milestone: false, status: 'planned' },
  { name: 'Согласование и защита отчёта', start: 18, end: 35, milestone: true, status: 'planned' },
]

/** Задачи из прототипа; домены ищутся по имени внутри проекта. */
const demoTasks: Array<{
  title: string
  description?: string
  assignee: string
  deadline: number
  stage: string
  domain?: string
  status: TaskStatus
  doneAt?: number
}> = [
  { title: 'Согласовать план выезда и список респондентов', description: 'Отправили план, ждём подтверждения от Рустема.', assignee: 'ivan@ordiks.ru', deadline: -4, stage: 'Подготовка', status: 'done', doneAt: -5 },
  { title: 'Подготовить опросники интервью по планированию и ТОиР', assignee: 'anna@ordiks.ru', deadline: -3, stage: 'Подготовка', status: 'done', doneAt: -4 },
  { title: 'Интервью: директор Гареев Р.', description: 'Стратегия, боли, ожидания от цифровизации.', assignee: 'ivan@ordiks.ru', deadline: -1, stage: 'Выезд и сбор фактов', status: 'done', doneAt: -1 },
  { title: 'Обойти цех плит и зафиксировать путь заказа', description: 'Фото + конспект: от плана смены до сдачи на склад.', assignee: 'anna@ordiks.ru', deadline: 0, stage: 'Выезд и сбор фактов', domain: 'Планирование: цех плит', status: 'doing' },
  { title: 'Собрать выгрузку 1С по отгрузкам за 12 мес.', assignee: 'ivan@ordiks.ru', deadline: -2, stage: 'Выезд и сбор фактов', domain: 'Отгрузка', status: 'doing' },
  { title: 'Получить реестр форм и матриц с циклами', description: 'Запрос отправлен, ответ просрочен.', assignee: 'anna@ordiks.ru', deadline: -2, stage: 'Выезд и сбор фактов', domain: 'Оснастка: формы и матрицы', status: 'todo' },
  { title: 'Интервью: лаборатория и ОТК', assignee: 'anna@ordiks.ru', deadline: 1, stage: 'Выезд и сбор фактов', domain: 'ОТК', status: 'todo' },
  { title: 'Описать AS-IS «Путь клиентского заказа»', description: 'Черновик готов, ждём факты по отгрузке.', assignee: 'ivan@ordiks.ru', deadline: 6, stage: 'Анализ и моделирование', status: 'todo' },
  { title: 'Карта ИТ-ландшафта и потоков данных', assignee: 'olga@demo.ordiks.ru', deadline: 9, stage: 'Анализ и моделирование', domain: 'ИТ-системы', status: 'todo' },
  { title: 'Собрать реестр рисков проекта', assignee: 'ivan@ordiks.ru', deadline: 14, stage: 'Анализ и моделирование', status: 'todo' },
  { title: 'Презентация результатов руководству', assignee: 'ivan@ordiks.ru', deadline: 30, stage: 'Согласование и защита отчёта', status: 'todo' },
]

const day = 24 * 60 * 60 * 1000

function addDays(days: number) {
  return new Date(Date.now() + days * day)
}

function domainStatus(done: number | undefined, checklistLength: number): 'not_started' | 'in_progress' | 'closed' {
  if (done === undefined || done === 0) return 'not_started'
  if (done >= checklistLength) return 'closed'
  return 'in_progress'
}

async function upsertDemoUser(db: DbClient, user: DemoUser, password: string) {
  const existing = await db.user.findUnique({ where: { email: user.email } })
  if (!existing) {
    return db.user.create({
      data: {
        email: user.email,
        displayName: user.displayName,
        orgRole: user.orgRole,
        passwordHash: await Bun.password.hash(password, { algorithm: 'argon2id' }),
      },
      select: { id: true, email: true },
    })
  }

  const passwordMatches = existing.passwordHash !== null
    && await Bun.password.verify(password, existing.passwordHash).catch(() => false)
  return db.user.update({
    where: { id: existing.id },
    data: {
      displayName: user.displayName,
      orgRole: user.orgRole,
      // Пароль переписываем только если он действительно другой: повторный сид не должен
      // сбрасывать то, что администратор поменял руками.
      ...(passwordMatches ? {} : { passwordHash: await Bun.password.hash(password, { algorithm: 'argon2id' }) }),
    },
    select: { id: true, email: true },
  })
}

async function seedDemoData(db: DbClient, password: string) {
  const users = new Map<string, { id: string; email: string }>()
  for (const user of demoUsers) {
    users.set(user.email, await upsertDemoUser(db, user, password))
  }

  let project = await db.project.findFirst({ where: { name: DEMO_PROJECT_NAME } })
  let createdProject = false
  if (!project) {
    project = await db.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: DEMO_PROJECT_NAME,
          client: 'ООО «Завод ЖБИ»',
          city: 'Уфа',
          boundaries: 'Обследование управленческого и производственного контура. Не входит: аудит финансовой отчётности, кадровый контур.',
          goals: 'Единая цифровая система: клиент → заказ → планирование → производство → качество → склад → отгрузка → документы → себестоимость. Плюс контур управления активами (ТОиР, оснастка).',
          shops: demoShops,
          settings: demoSettings,
        },
      })

      for (const [index, stage] of demoStages.entries()) {
        await tx.stage.create({
          data: {
            projectId: created.id,
            name: stage.name,
            sortOrder: index,
            startAt: addDays(stage.start),
            endAt: addDays(stage.end),
            milestone: stage.milestone,
            status: stage.status,
          },
        })
      }

      const domainIds = new Map<string, string>()
      for (const [groupIndex, group] of demoDomainTree.entries()) {
        await tx.domainGroup.create({
          data: {
            projectId: created.id,
            name: group.group,
            sortOrder: groupIndex,
            domains: {
              create: group.domains.map((domain, domainIndex) => ({
                projectId: created.id,
                name: domain.name,
                sortOrder: domainIndex,
                ownerId: domain.owner ? users.get(domain.owner)!.id : null,
                status: domainStatus(domain.done, domain.checklist.length),
                items: {
                  create: domain.checklist.map((text, itemIndex) => ({
                    text,
                    sortOrder: itemIndex,
                    done: domain.done !== undefined && itemIndex < domain.done,
                  })),
                },
              })),
            },
          },
        })
        for (const domain of group.domains) {
          // Идентификаторы доменов нужны для привязки задач; достаём после создания.
          const row = await tx.domain.findFirst({
            where: { projectId: created.id, name: domain.name },
            select: { id: true },
          })
          if (row) domainIds.set(domain.name, row.id)
        }
      }

      const stages = await tx.stage.findMany({ where: { projectId: created.id } })
      const stageIds = new Map(stages.map((stage) => [stage.name, stage.id]))
      for (const [index, task] of demoTasks.entries()) {
        await tx.task.create({
          data: {
            projectId: created.id,
            stageId: stageIds.get(task.stage) ?? null,
            domainId: task.domain ? domainIds.get(task.domain) ?? null : null,
            assigneeId: users.get(task.assignee)!.id,
            title: task.title,
            description: task.description ?? '',
            deadline: addDays(task.deadline),
            status: task.status,
            sortOrder: index,
            doneAt: task.doneAt !== undefined ? addDays(task.doneAt) : null,
          },
        })
      }

      return created
    })
    createdProject = true
  } else {
    // Существующий проект: обновляем только паспорт, прогресс не трогаем.
    project = await db.project.update({
      where: { id: project.id },
      data: {
        client: 'ООО «Завод ЖБИ»',
        city: 'Уфа',
        shops: demoShops,
        settings: demoSettings,
      },
    })
  }

  for (const member of demoMembers) {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: users.get(member.email)!.id } },
      create: { projectId: project.id, userId: users.get(member.email)!.id, role: member.role },
      update: { role: member.role },
    })
  }

  const invite = await db.invite.findUnique({ where: { code: DEMO_INVITE_CODE } })
  if (!invite) {
    await db.invite.create({
      data: {
        code: DEMO_INVITE_CODE,
        projectId: project.id,
        orgRole: 'client',
        memberRole: 'client_lead',
        note: 'для команды заказчика',
        createdById: users.get('ivan@ordiks.ru')!.id,
      },
    })
  }

  return { project, createdProject, users: [...users.values()] }
}

const env = Bun.env
if (env.DEMO_SEED_ALLOWED !== '1') {
  console.error(
    'Demo seed is disabled: set DEMO_SEED_ALLOWED=1 to deliberately seed demo data ' +
      '(this flag is also how the production container opts in).',
  )
  process.exit(1)
}

const databaseUrl = env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('DATABASE_URL is required for the demo seed')
  process.exit(1)
}

const password = env.DEMO_SEED_PASSWORD?.trim() || DEFAULT_DEMO_PASSWORD

const prisma = createPrisma(databaseUrl)
try {
  const result = await seedDemoData(prisma, password)
  console.log(`Seeded ${result.users.length} demo users (password: ${password}).`)
  console.log(
    result.createdProject
      ? `Created demo project «${DEMO_PROJECT_NAME}» with stages, domains, and tasks.`
      : `Refreshed the passport of existing demo project «${DEMO_PROJECT_NAME}»; progress untouched.`,
  )
  console.log(`Demo invite ${DEMO_INVITE_CODE} is available for the client team (client_lead).`)
} finally {
  await prisma.$disconnect()
}
