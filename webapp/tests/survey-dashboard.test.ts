import type {
  DataRequestDto,
  DomainGroupDto,
  FindingDto,
  StageDto,
  TaskDto,
} from '@ordiks-survey/contracts'
import { expect, test } from 'bun:test'

import {
  coverageOf,
  dashboardKpis,
  isOpenFinding,
  milestoneOf,
  moveTaskStatus,
  partitionByStatus,
  toggleChecklistDone,
  topFindingsOf,
  waitingRequestsFor,
} from '../src/features/survey/dashboard-model'

const findingStatuses = [
  { id: 'registered', name: 'Зарегистрирована', color: 'gray' as const },
  { id: 'confirmed', name: 'Подтверждена', color: 'blue' as const },
  { id: 'closed', name: 'Закрыта', color: 'green' as const },
]

function domainGroup(overrides: Partial<DomainGroupDto> = {}): DomainGroupDto {
  return {
    id: 'g1',
    projectId: 'p1',
    name: 'Производство',
    sortOrder: 0,
    domains: [
      {
        id: 'd1',
        projectId: 'p1',
        groupId: 'g1',
        ownerId: null,
        name: 'Планирование',
        status: 'in_progress',
        sortOrder: 0,
        checklist: [
          { id: 'i1', domainId: 'd1', text: 'Вход', done: true, sortOrder: 0 },
          { id: 'i2', domainId: 'd1', text: 'План', done: true, sortOrder: 1 },
          { id: 'i3', domainId: 'd1', text: 'Изменения', done: false, sortOrder: 2 },
        ],
      },
      {
        id: 'd2',
        projectId: 'p1',
        groupId: 'g1',
        ownerId: null,
        name: 'Диспетчеризация',
        status: 'not_started',
        sortOrder: 1,
        checklist: [
          { id: 'i4', domainId: 'd2', text: 'Факт', done: false, sortOrder: 0 },
        ],
      },
    ],
    ...overrides,
  }
}

test('coverage counts checklist items and closed domains across groups', () => {
  const coverage = coverageOf([domainGroup()])
  expect(coverage).toEqual({
    done: 2,
    total: 4,
    closedDomains: 0,
    allDomains: 2,
    percent: 50,
  })
})

test('waiting requests: client sees own, team and observer see all; overdue first', () => {
  const base = {
    projectId: 'p1',
    domainId: null,
    assigneeId: 'user-1',
    what: '',
    why: '',
    deadline: null,
    receivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const own = { ...base, id: 'r1', assigneeId: 'user-1', status: 'requested' as const, overdue: false }
  const foreign = { ...base, id: 'r2', assigneeId: 'user-2', status: 'requested' as const, overdue: true }
  const received = {
    ...base,
    id: 'r3',
    assigneeId: 'user-1',
    status: 'received' as const,
    overdue: false,
  }

  expect(waitingRequestsFor('client', 'user-1', [own, foreign, received]).map((r) => r.id)).toEqual([
    'r1',
  ])
  expect(waitingRequestsFor('team', 'user-1', [own, foreign, received]).map((r) => r.id)).toEqual([
    'r2',
    'r1',
  ])
  expect(
    waitingRequestsFor('observer', 'user-9', [own, foreign, received]).map((r) => r.id),
  ).toEqual(['r2', 'r1'])
})

test('open findings exclude statuses marked closed in the dictionary', () => {
  const finding = (id: string, status: string): FindingDto => ({
    id,
    projectId: 'p1',
    domainId: null,
    factId: null,
    ownerId: null,
    title: '',
    description: '',
    category: 'Процесс',
    priority: 'Средний',
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })

  expect(isOpenFinding(finding('f1', 'confirmed'), findingStatuses)).toBe(true)
  expect(isOpenFinding(finding('f2', 'closed'), findingStatuses)).toBe(false)
  expect(isOpenFinding(finding('f3', 'Закрыта'), findingStatuses)).toBe(false)
})

test('top findings sort by prototype priority rank', () => {
  const finding = (id: string, priority: string): FindingDto => ({
    id,
    projectId: 'p1',
    domainId: null,
    factId: null,
    ownerId: null,
    title: '',
    description: '',
    category: '',
    priority,
    status: 'registered',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })

  const ranked = topFindingsOf([
    finding('low', 'Низкий'),
    finding('crit', 'Критично'),
    finding('mid', 'Средний'),
    finding('high', 'Высокий'),
    finding('other', 'Особый'),
  ])
  expect(ranked.map((item) => item.id)).toEqual(['crit', 'high', 'mid', 'low', 'other'])
})

test('milestone picks the nearest future stage with an end date, else the last one', () => {
  const stage = (id: string, endAt: string | null, milestone: boolean): StageDto => ({
    id,
    projectId: 'p1',
    name: id,
    sortOrder: 0,
    startAt: null,
    endAt,
    milestone,
    status: 'planned',
  })
  const past = stage('past', '2020-01-01T00:00:00.000Z', false)
  const soon = stage('soon', '2999-01-01T00:00:00.000Z', true)
  const later = stage('later', '2999-06-01T00:00:00.000Z', false)

  expect(milestoneOf([later, past, soon])?.id).toBe('soon')
  expect(milestoneOf([past])?.id).toBe('past')
  expect(milestoneOf([])).toBe(null)
})

test('dashboard KPIs hide the team coverage card from client and observer', () => {
  const input = {
    coverage: coverageOf([domainGroup()]),
    findings: [],
    findingStatuses,
    requests: [] as DataRequestDto[],
    userId: 'user-1',
    stages: [] as StageDto[],
    interviews: [],
  }

  const teamCards = dashboardKpis({ ...input, viewRole: 'team' })
  const clientCards = dashboardKpis({ ...input, viewRole: 'client' })
  const observerCards = dashboardKpis({ ...input, viewRole: 'observer' })

  expect(teamCards.map((card) => card.key)).toContain('coverage')
  expect(clientCards.map((card) => card.key)).not.toContain('coverage')
  expect(observerCards.map((card) => card.key)).not.toContain('coverage')

  // Подписи запросов адресные: клиенту — «к вам», команде и наблюдателю — «к заказчику».
  expect(clientCards.find((card) => card.key === 'requests')?.label).toBe('Запросы к вам')
  expect(teamCards.find((card) => card.key === 'requests')?.label).toBe('Запросы к заказчику')
  expect(observerCards.find((card) => card.key === 'requests')?.label).toBe('Запросы к заказчику')
})

test('kanban partition keeps the four fixed columns in order', () => {
  const task = (id: string, status: TaskDto['status']): TaskDto => ({
    id,
    projectId: 'p1',
    stageId: null,
    domainId: null,
    assigneeId: null,
    title: id,
    description: '',
    deadline: null,
    status,
    sortOrder: 0,
    doneAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })

  const columns = partitionByStatus([
    task('a', 'doing'),
    task('b', 'todo'),
    task('c', 'cancelled'),
    task('d', 'done'),
  ])

  expect(columns.map((column) => column.status)).toEqual(['todo', 'doing', 'done', 'cancelled'])
  expect(columns[0].tasks.map((item) => item.id)).toEqual(['b'])
  expect(columns[1].tasks.map((item) => item.id)).toEqual(['a'])
})

test('kanban move steps one column at a time and stops at the edges', () => {
  expect(moveTaskStatus('todo', 1)).toBe('doing')
  expect(moveTaskStatus('doing', 1)).toBe('done')
  expect(moveTaskStatus('done', 1)).toBe('cancelled')
  expect(moveTaskStatus('todo', -1)).toBe(null)
  expect(moveTaskStatus('cancelled', 1)).toBe(null)
  expect(moveTaskStatus('cancelled', -1)).toBe('done')
})

test('checklist toggle flips exactly the target item', () => {
  const items = [
    { id: 'i1', done: false },
    { id: 'i2', done: true },
  ]
  const toggled = toggleChecklistDone(items, 'i1')
  expect(toggled[0].done).toBe(true)
  expect(toggled[1].done).toBe(true)
  // Исходный массив не мутирован.
  expect(items[0].done).toBe(false)
})
