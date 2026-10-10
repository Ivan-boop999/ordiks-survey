import 'dotenv/config'

import type { MemberRole, OrgRole, StageStatus, TaskStatus } from '@ordiks-survey/contracts'

import { createPrisma, type DbClient } from '../src/db'
import { loadEnv } from '../src/env'
import { FilesystemPrivateStorage } from '../src/storage/filesystem-storage'
import { assertSafeObjectKey, createPrivateStorage } from '../src/storage'

/**
 * Демо-сид «Ордикс Обследование»: команда ОРДИКС, клиентские пользователи и проект
 * «ЖБИ-завод, Уфа» с этапами, доменами, задачами, гайдами с условным вопросом, интервью
 * (одно с заполненными ответами), фактами (пара фото — реальные объекты в локальном
 * хранилище), запросами данных (два просрочены по относительным датам) и находками —
 * всё из кликабельного прототипа (seedDemoState).
 *
 * Защита: запускается только при DEMO_SEED_ALLOWED=1 (осознанное решение владельца;
 * так делает и корневой Dockerfile). Идемпотентен: пользователи и члены — upsert по
 * email, проект — upsert по названию; у существующего проекта обновляется паспорт,
 * прогресс (этапы/домены/задачи) не трогается; сущности B2 засеиваются только если
 * семейство пустое (повторный запуск их не дублирует).
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

/** Задачи из прототипа; домены ищутся по имени внутри проекта. */const demoTasks: Array<{
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

// ============================================================
// Демо-данные волны B2: гайды, интервью, факты, запросы, находки
// (перенос seedDemoState прототипа; даты — смещениями от сегодня)
// ============================================================

const demoGuides: Array<{
  name: string
  sections: Array<{
    title: string
    questions: Array<{
      type: 'text' | 'yn' | 'scale' | 'choice' | 'multi'
      text: string
      options?: string[]
      showIfIndex?: number
      showIfValue?: string
    }>
  }>
}> = [
  {
    name: 'Опросник: планирование производства',
    sections: [
      {
        title: 'Текущий процесс',
        questions: [
          { type: 'text', text: 'Как заказ клиента превращается в план цеха? Кто участвует?' },
          { type: 'yn', text: 'План фиксируется в единой системе?' },
          { type: 'text', text: 'Если нет — где живёт план и кто его ведёт?', showIfIndex: 1, showIfValue: 'no' },
          { type: 'scale', text: 'Насколько стабильно выполняется план месяца? (1 — постоянно срываем, 5 — почти всегда выполняем)' },
        ],
      },
      {
        title: 'Изменения и приоритеты',
        questions: [
          { type: 'choice', text: 'Как чаще всего поступают срочные заказы?', options: ['Вытесняют план', 'Вставляются в окна', 'Переносится другое', 'Другое'] },
          { type: 'multi', text: 'Где живёт план сегодня?', options: ['Excel', '1С', 'Бумага', 'Мессенджеры', 'Доска в цехе'] },
        ],
      },
    ],
  },
  {
    name: 'Опросник: ТОиР и оснастка',
    sections: [
      {
        title: 'Оборудование',
        questions: [
          { type: 'text', text: 'Как ведётся учёт наработки оборудования?' },
          { type: 'yn', text: 'Есть ли регламенты ППР на каждую единицу?' },
          { type: 'scale', text: 'Насколько предсказуемы отказы? (1 — постоянно сюрпризы, 5 — всё по плану)' },
        ],
      },
      {
        title: 'Оснастка',
        questions: [
          { type: 'text', text: 'Как понимаете остаточный ресурс формы?' },
          { type: 'choice', text: 'Что делаете с формой при исчерпании ресурса?', options: ['Ремонт', 'Списываем', 'Заказываем новую', 'Продолжаем до отказа'] },
        ],
      },
    ],
  },
]

const demoInterviews: Array<{
  day: number
  time: string
  respondent: string
  role: string
  domain: string
  status: 'planned' | 'done' | 'formatted'
  guide?: number
  notes: string
  /** Ответы по индексам плоского списка вопросов гайда (значения как в прототипе). */
  answers?: Record<number, string | string[]>
}> = [
  {
    day: -1, time: '10:00', respondent: 'Рустем Гареев', role: 'Директор завода', domain: 'Продажи и договоры', status: 'done',
    notes: 'Цифровизация — решение собственника. Главные боли: непрозрачность выполнения заказа, срыв сроков отгрузки, ручное сведение отчётов. Ожидание: «видеть заказ от оплаты до отгрузки». Бюджетный цикл — согласование с собственником.',
  },
  {
    day: -1, time: '14:00', respondent: 'Марат Хайруллин', role: 'Начальник цеха плит', domain: 'Планирование: цех плит', status: 'done', guide: 0,
    notes: 'План месяца — в Excel у ПДО, сменные задания — бумага. Мастер обходит посты, факт пишет в журнал к концу смены. Срочные заказы «по звонку» вытесняют план.',
    answers: {
      0: 'Заказ попадает в Excel ПДО, диспетчер раскидывает по цехам, цех пишет на бумагу.',
      1: 'no',
      // Условный вопрос раскрыт: исходный yn = no.
      2: 'План месяца — в Excel у ПДО, сменные задания — на бумаге у мастеров.',
      3: '2',
      4: 'Вытесняют план',
      5: ['Excel', 'Бумага', 'Мессенджеры'],
    },
  },
  {
    day: 0, time: '09:30', respondent: 'Ильдар Ахметов', role: 'Начальник цеха ВПИ №1', domain: 'Планирование: цех ВПИ №1', status: 'done', guide: 0,
    notes: 'Работают по неделей скользящему графику. Загрузку линий держат в голове и на магнитной доске. Полуфабрикаты между ВПИ учитываются вручную.',
  },
  {
    day: 1, time: '11:00', respondent: 'Гульнара Сафина', role: 'Начальник лаборатории', domain: 'Лаборатория', status: 'planned',
    notes: '',
  },
  {
    day: -2, time: '10:00', respondent: 'Айрат Сабиров', role: 'Мастер смены, цех плит', domain: 'Фактический выпуск', status: 'formatted', guide: 0,
    notes: 'Смена 12 часов. Задания получают устно на планёрке + бумага. Выпуск пишет в журнал, брак — в отдельный тетради простоев. Итоги сдают мастеру, тот — в ПДО вечером.',
  },
]

const demoFacts: Array<{
  title: string
  description: string
  domain: string
  shop: string
  author: string
  day: number
  kind: 'photo' | 'file' | 'note'
  typeKey: string
  fileName?: string
  /** Реальная загрузка в локальное хранилище (filesystem-драйвер); иначе демо-фото без объекта. */
  realPhoto?: boolean
}> = [
  { title: 'Журнал смены, цех плит', description: 'Факт выпуска мастер записывает вручную в журнал в конце смены.', domain: 'Фактический выпуск', shop: 'Цех плит', author: 'anna@ordiks.ru', day: -1, kind: 'photo', typeKey: 'photo', realPhoto: true },
  { title: 'План месяца в Excel (ПДО)', description: 'Один файл, 14 листов, правят 3 человека одновременно по сети.', domain: 'Диспетчеризация', shop: 'ПДО', author: 'ivan@ordiks.ru', day: -1, kind: 'photo', typeKey: 'photo', realPhoto: true },
  { title: 'Магнитная доска загрузки ВПИ №1', description: 'Фактическая загрузка линий видна только стоя у доски.', domain: 'Планирование: цех ВПИ №1', shop: 'Цех ВПИ №1', author: 'anna@ordiks.ru', day: 0, kind: 'photo', typeKey: 'photo' },
  { title: 'Форма плит после 400+ циклов', description: 'Рабочая кромка изношена, геометрия на грани допуска. Ресурс форм нигде не учитывается.', domain: 'Оснастка: формы и матрицы', shop: 'Цех плит', author: 'ivan@ordiks.ru', day: 0, kind: 'photo', typeKey: 'photo' },
  { title: 'Тетрадь простоев, ВПИ №2', description: 'Простои фиксируются от руки; причина указывается в свободной форме.', domain: 'Фактический выпуск', shop: 'Цех ВПИ №2', author: 'anna@ordiks.ru', day: 0, kind: 'photo', typeKey: 'photo' },
  { title: 'Стенд паспортов качества', description: 'Паспорта печатаются пакетом раз в день, привязка к партии — ручная.', domain: 'Лаборатория', shop: 'Лаборатория', author: 'ivan@ordiks.ru', day: -1, kind: 'photo', typeKey: 'photo' },
  { title: 'Склад ГП: площадка без адресации', description: 'Готовая продукция на площадках, поиск паллеты — глазами и опытом кладовщика.', domain: 'Склад готовой продукции', shop: 'Склад ГП', author: 'anna@ordiks.ru', day: 0, kind: 'photo', typeKey: 'photo' },
  { title: 'Двойной ввод отгрузки', description: 'Отгрузка вводится в 1С бухгалтерией и параллельно в таблицу логиста — расхождения разбирают по телефону.', domain: 'Отгрузка', shop: 'Отдел продаж', author: 'ivan@ordiks.ru', day: -1, kind: 'note', typeKey: 'note' },
  { title: 'Наработка оборудования', description: 'Часы наработки нигде не накапливаются; ППР по календарю «раз в полгода», без привязки к фактической загрузке.', domain: 'ТОиР и ППР', shop: 'ОГМ', author: 'ivan@ordiks.ru', day: -2, kind: 'note', typeKey: 'gauge' },
  { title: 'Выгрузка 1С: отгрузки 12 мес.', description: 'Получили от бухгалтерии, формат — xls.', domain: 'Отгрузка', shop: 'Бухгалтерия', author: 'olga@demo.ordiks.ru', day: -2, kind: 'file', typeKey: 'file', fileName: 'otgruzki_12m.xls' },
  { title: 'Регламент ППР (фрагмент)', description: 'Общий документ 2019 года, не привязан к единицам оборудования.', domain: 'ТОиР и ППР', shop: 'ОГМ', author: 'marat@demo.ordiks.ru', day: -2, kind: 'file', typeKey: 'file', fileName: 'reglament_ppr_2019.pdf' },
  { title: 'Оператор поста формовки', description: 'Оператор отмечает выполненные операции в наряде-бумаге, штамп у мастера.', domain: 'Фактический выпуск', shop: 'Цех ВПИ №1', author: 'anna@ordiks.ru', day: 0, kind: 'photo', typeKey: 'photo' },
]

const demoRequests: Array<{
  what: string
  why: string
  domain: string
  assignee: string
  deadline: number
  createdAt: number
  status: 'requested' | 'in_progress' | 'received'
}> = [
  { what: 'Реестр оборудования с инвентарными номерами', why: 'База для анализа ТОиР и наработки', domain: 'ТОиР и ППР', assignee: 'olga@demo.ordiks.ru', deadline: -2, createdAt: -6, status: 'requested' },
  { what: 'Реестр форм и матриц с количеством циклов', why: 'Оценка остаточного ресурса оснастки', domain: 'Оснастка: формы и матрицы', assignee: 'marat@demo.ordiks.ru', deadline: -1, createdAt: -5, status: 'requested' },
  { what: 'Выгрузка отгрузок из 1С за 12 месяцев', why: 'Анализ структуры заказов и сезонности', domain: 'Отгрузка', assignee: 'olga@demo.ordiks.ru', deadline: -3, createdAt: -8, status: 'received' },
  { what: 'Действующие регламенты ППР', why: 'Сравнение с фактическим обслуживанием', domain: 'ТОиР и ППР', assignee: 'marat@demo.ordiks.ru', deadline: 3, createdAt: -4, status: 'in_progress' },
  { what: 'Схема сети и список серверов', why: 'Оценка ИТ-инфраструктуры для целевой архитектуры', domain: 'Инфраструктура', assignee: 'olga@demo.ordiks.ru', deadline: 4, createdAt: -3, status: 'in_progress' },
]

const demoFindings: Array<{
  title: string
  description: string
  category: string
  priority: string
  domain: string
  factTitle?: string
  owner: string
  status: string
  day: number
}> = [
  { title: 'Факт смены появляется на следующий день', description: 'Мастер сдаёт журнал вечером, ПДО сводит утром. Руководство видит картину суток с задержкой и без причин отклонений.', category: 'Процесс', priority: 'Критично', domain: 'Фактический выпуск', factTitle: 'Журнал смены, цех плит', owner: 'ivan@ordiks.ru', status: 'confirmed', day: -2 },
  { title: 'План производства существует в 3 несвязанных местах', description: 'Excel ПДО, бумажные сменные задания и магнитная доска. Единой версии плана нет, изменения не синхронизируются.', category: 'Данные', priority: 'Критично', domain: 'Планирование: цех плит', factTitle: 'План месяца в Excel (ПДО)', owner: 'anna@ordiks.ru', status: 'confirmed', day: -2 },
  { title: 'Ресурс оснастки не учитывается', description: 'Формы и матрицы не имеют паспорта циклов. Риск брака по геометрии и внезапной остановки цеха плит.', category: 'Оборудование', priority: 'Высокий', domain: 'Оснастка: формы и матрицы', factTitle: 'Форма плит после 400+ циклов', owner: 'ivan@ordiks.ru', status: 'registered', day: -1 },
  { title: 'ППР по календарю, а не по наработке', description: 'Обслуживание раз в полгода независимо от загрузки: перерасход на тихих машинах и внезапные отказы на нагруженных.', category: 'Процесс', priority: 'Высокий', domain: 'ТОиР и ППР', factTitle: 'Наработка оборудования', owner: 'ivan@ordiks.ru', status: 'discussed', day: -1 },
  { title: 'Двойной ввод отгрузок', description: '1С + таблица логиста, расхождения разбираются по телефону.', category: 'Данные', priority: 'Средний', domain: 'Отгрузка', factTitle: 'Двойной ввод отгрузки', owner: 'anna@ordiks.ru', status: 'registered', day: 0 },
  { title: 'Склад без адресации и резервирования', description: 'Поиск паллеты — опытом кладовщика; резерв под заказ не виден продажам.', category: 'Процесс', priority: 'Средний', domain: 'Склад готовой продукции', factTitle: 'Склад ГП: площадка без адресации', owner: 'anna@ordiks.ru', status: 'registered', day: 0 },
  { title: 'Нет связи планов с ППР', description: 'Производственный план не учитывает планируемые остановки оборудования: конфликты всплывают в момент остановки.', category: 'Организация', priority: 'Высокий', domain: 'Диспетчеризация', owner: 'ivan@ordiks.ru', status: 'confirmed', day: 0 },
]

/// Минимальный валидный JPEG 1×1: демо-фото в локальном хранилище (сером пикселе достаточно,
/// содержимое в демо условно).
const demoPhotoBytes = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/2gAMAwEAAhEDEQA/AKgA/9k=',
  ),
  (character) => character.charCodeAt(0),
)

/** Кладёт демо-объект в локальное хранилище; недоступно/не filesystem — просто пропускаем. */
async function putDemoStorageObject(
  env: Record<string, string | undefined>,
  projectId: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const key = `projects/${projectId}/facts/${crypto.randomUUID()}`
  try {
    const appEnv = loadEnv(env)
    const storage = createPrivateStorage(appEnv).storage
    if (!(storage instanceof FilesystemPrivateStorage)) return null
    await storage.putObjectOnce(assertSafeObjectKey(key), bytes, 'image/jpeg')
    return key
  } catch {
    return null
  }
}

/**
 * Сущности B2 сеются только в пустые семейства: свежий проект получает всё сразу, проект
 * времён B1 — досеивается один раз, повторные запуски ничего не дублируют и не затирают.
 */
async function seedSurveyEntities(
  db: DbClient,
  project: { id: string },
  users: Map<string, { id: string; email: string }>,
  env: Record<string, string | undefined>,
) {
  const domains = await db.domain.findMany({
    where: { projectId: project.id },
    select: { id: true, name: true },
  })
  const domainId = (name: string) => domains.find((domain) => domain.name === name)?.id ?? null
  const userId = (email: string) => users.get(email)?.id

  const [factCount, guideCount, interviewCount, requestCount, findingCount] = await Promise.all([
    db.fact.count({ where: { projectId: project.id } }),
    db.guide.count({ where: { projectId: project.id } }),
    db.interview.count({ where: { projectId: project.id } }),
    db.dataRequest.count({ where: { projectId: project.id } }),
    db.finding.count({ where: { projectId: project.id } }),
  ])

  let factIdByTitle = new Map<string, string>()

  if (factCount === 0) {
    for (const fact of demoFacts) {
      // Реальные фото кладём в локальное хранилище, когда это просто (filesystem-драйвер);
      // остальные фото — демо-фото без объекта, файлы выгрузок — просто ярлык с именем файла.
      let objectKey: string | null = null
      if (fact.realPhoto) {
        objectKey = await putDemoStorageObject(env, project.id, demoPhotoBytes)
      }
      const description = fact.kind === 'photo' && !objectKey
        ? `${fact.description} (демо-фото)`
        : fact.description
      const created = await db.fact.create({
        data: {
          projectId: project.id,
          domainId: domainId(fact.domain),
          authorId: userId(fact.author)!,
          kind: fact.kind,
          typeKey: fact.typeKey,
          title: fact.title,
          description,
          shop: fact.shop,
          factDate: addDays(fact.day),
          objectKey,
          fileName: fact.fileName ?? (objectKey ? `${fact.typeKey}-demo.jpg` : null),
        },
        select: { id: true, title: true },
      })
      factIdByTitle.set(created.title, created.id)
    }
  } else {
    const rows = await db.fact.findMany({ where: { projectId: project.id }, select: { id: true, title: true } })
    factIdByTitle = new Map(rows.map((row) => [row.title, row.id]))
  }

  const guideIdByIndex = new Map<number, string>()
  if (guideCount === 0) {
    for (const [guideIndex, guide] of demoGuides.entries()) {
      const created = await db.$transaction(async (tx) => {
        const guideRow = await tx.guide.create({
          data: { projectId: project.id, name: guide.name },
        })
        for (const [sectionIndex, section] of guide.sections.entries()) {
          const sectionRow = await tx.guideSection.create({
            data: { guideId: guideRow.id, title: section.title, sortOrder: sectionIndex },
          })
          for (const [questionIndex, question] of section.questions.entries()) {
            await tx.guideQuestion.create({
              data: {
                sectionId: sectionRow.id,
                type: question.type,
                text: question.text,
                options: question.options ?? [],
                sortOrder: questionIndex,
              },
            })
          }
        }
        return guideRow
      })

      // Перевязка showIf: индексы плоского списка вопросов гайда → реальные id.
      const flatQuestions = await db.guideQuestion.findMany({
        where: { section: { guideId: created.id } },
        orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      })
      for (const section of guide.sections) {
        for (const question of section.questions) {
          if (question.showIfIndex === undefined) continue
          const dependent = flatQuestions.find((row) => row.text === question.text)
          const source = flatQuestions[question.showIfIndex]
          if (dependent && source) {
            await db.guideQuestion.update({
              where: { id: dependent.id },
              data: { showIfQuestionId: source.id, showIfValue: question.showIfValue ?? null },
            })
          }
        }
      }
      guideIdByIndex.set(guideIndex, created.id)
    }
  } else {
    const rows = await db.guide.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    rows.forEach((row, index) => guideIdByIndex.set(index, row.id))
  }

  if (interviewCount === 0) {
    for (const interview of demoInterviews) {
      const created = await db.interview.create({
        data: {
          projectId: project.id,
          domainId: domainId(interview.domain),
          guideId: interview.guide !== undefined ? guideIdByIndex.get(interview.guide) ?? null : null,
          scheduledAt: new Date(`${addDays(interview.day).toISOString().slice(0, 10)}T${interview.time}:00.000Z`),
          respondent: interview.respondent,
          respondentRole: interview.role,
          status: interview.status,
          notes: interview.notes,
        },
      })
      if (interview.answers && created.guideId) {
        const questions = await db.guideQuestion.findMany({
          where: { section: { guideId: created.guideId } },
          orderBy: [{ section: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
        })
        for (const [index, value] of Object.entries(interview.answers)) {
          const question = questions[Number(index)]
          if (!question) continue
          await db.interviewAnswer.create({
            data: { interviewId: created.id, questionId: question.id, value },
          })
        }
      }
    }
  }

  if (requestCount === 0) {
    for (const request of demoRequests) {
      await db.dataRequest.create({
        data: {
          projectId: project.id,
          domainId: domainId(request.domain),
          assigneeId: userId(request.assignee) ?? null,
          what: request.what,
          why: request.why,
          deadline: addDays(request.deadline),
          status: request.status,
          createdAt: addDays(request.createdAt),
          receivedAt: request.status === 'received' ? addDays(request.deadline) : null,
        },
      })
    }
  }

  if (findingCount === 0) {
    for (const finding of demoFindings) {
      await db.finding.create({
        data: {
          projectId: project.id,
          domainId: domainId(finding.domain),
          factId: finding.factTitle ? factIdByTitle.get(finding.factTitle) ?? null : null,
          ownerId: userId(finding.owner) ?? null,
          title: finding.title,
          description: finding.description,
          category: finding.category,
          priority: finding.priority,
          status: finding.status,
          createdAt: addDays(finding.day),
        },
      })
    }
  }

  return {
    facts: factCount > 0 ? 0 : demoFacts.length,
    guides: guideCount > 0 ? 0 : demoGuides.length,
    interviews: interviewCount > 0 ? 0 : demoInterviews.length,
    requests: requestCount > 0 ? 0 : demoRequests.length,
    findings: findingCount > 0 ? 0 : demoFindings.length,
  }
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

async function seedDemoData(db: DbClient, password: string, env: Record<string, string | undefined>) {
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

  // Сущности волны B2: гайды, интервью, факты, запросы, находки — только в пустые семейства.
  const seeded = await seedSurveyEntities(db, project, users, env)

  return { project, createdProject, seeded, users: [...users.values()] }
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
  const result = await seedDemoData(prisma, password, Bun.env)
  console.log(`Seeded ${result.users.length} demo users (password: ${password}).`)
  console.log(
    result.createdProject
      ? `Created demo project «${DEMO_PROJECT_NAME}» with stages, domains, tasks, guides, interviews, facts, requests, and findings.`
      : `Refreshed the passport of existing demo project «${DEMO_PROJECT_NAME}»; progress untouched.`,
  )
  const seededFamilies = Object.entries(result.seeded)
    .filter(([, count]) => count > 0)
    .map(([family, count]) => `${count} ${family}`)
  console.log(
    seededFamilies.length > 0
      ? `Seeded survey entities into empty families: ${seededFamilies.join(', ')}.`
      : 'Survey entities already present; nothing re-seeded.',
  )
  console.log(`Demo invite ${DEMO_INVITE_CODE} is available for the client team (client_lead).`)
} finally {
  await prisma.$disconnect()
}
