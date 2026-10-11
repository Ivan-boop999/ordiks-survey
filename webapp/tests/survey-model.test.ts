import { expect, test } from 'bun:test'

import {
  daysUntil,
  defaultProjectId,
  findingStatusMeta,
  isOverdue,
  isSectionAllowed,
  parseDateLocal,
  priorityMeta,
  sectionsForViewRole,
  sectionPath,
  toDateInputValue,
  viewRoleFor,
} from '../src/features/survey/model'

const teamUser = { orgRole: 'owner' as const }
const clientLead = { orgRole: 'client' as const, memberRole: 'client_lead' as const }
const observer = { orgRole: 'client' as const, memberRole: 'observer' as const }

test('view roles: team stays team, client membership splits into client and observer', () => {
  expect(viewRoleFor('owner', null)).toBe('team')
  expect(viewRoleFor('manager', 'observer')).toBe('team')
  expect(viewRoleFor('analyst', null)).toBe('team')
  expect(viewRoleFor('client', 'client_lead')).toBe('client')
  expect(viewRoleFor('client', 'client_staff')).toBe('client')
  expect(viewRoleFor('client', 'observer')).toBe('observer')
  expect(viewRoleFor('client', null)).toBe('client')
})

test('client roles do not see team-only sections (guides, settings)', () => {
  const team = sectionsForViewRole('team').map((item) => item.id)
  const client = sectionsForViewRole('client').map((item) => item.id)
  const observerSections = sectionsForViewRole('observer').map((item) => item.id)

  expect(team).toContain('guides')
  expect(team).toContain('settings')
  expect(client).not.toContain('guides')
  expect(client).not.toContain('settings')
  expect(observerSections).not.toContain('guides')
  expect(observerSections).not.toContain('settings')
  // Основной контур обследования доступен всем ролям.
  for (const list of [team, client, observerSections]) {
    for (const section of ['dashboard', 'plan', 'domains', 'requests', 'findings', 'passport']) {
      expect(list).toContain(section)
    }
  }
})

test('isSectionAllowed mirrors the section list', () => {
  expect(isSectionAllowed('client', 'guides')).toBe(false)
  expect(isSectionAllowed('team', 'guides')).toBe(true)
  expect(isSectionAllowed('observer', 'settings')).toBe(false)
  expect(isSectionAllowed('client', 'dashboard')).toBe(true)
})

test('sectionPath builds project URLs', () => {
  expect(sectionPath('p1', 'dashboard')).toBe('/survey/p/p1/dashboard')
})

test('finding status meta resolves by id or name from the project dictionary', () => {
  const statuses = [
    { id: 'registered', name: 'Зарегистрирована', color: 'gray' as const },
    { id: 'closed', name: 'Закрыта', color: 'green' as const },
  ]
  expect(findingStatusMeta('closed', statuses)).toEqual({ label: 'Закрыта', color: 'green' })
  expect(findingStatusMeta('Закрыта', statuses)).toEqual({ label: 'Закрыта', color: 'green' })
  expect(findingStatusMeta('unknown', statuses)).toEqual({ label: 'unknown', color: 'gray' })
})

test('priority meta maps prototype priorities to chip colors', () => {
  expect(priorityMeta('Критично').color).toBe('red')
  expect(priorityMeta('Высокий').color).toBe('amber')
  expect(priorityMeta('Средний').color).toBe('blue')
  expect(priorityMeta('Низкий').color).toBe('gray')
  expect(priorityMeta('Особый').color).toBe('gray')
})

test('daysUntil and isOverdue use calendar days', () => {
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  expect(daysUntil(tomorrow)).toBe(1)
  expect(daysUntil(yesterday)).toBe(-1)
  expect(isOverdue(yesterday)).toBe(true)
  expect(isOverdue(tomorrow)).toBe(false)
  expect(isOverdue(null)).toBe(false)
})

test('default project prefers the last used active project, then the first active one', () => {
  const active = { id: 'a', status: 'active' as const }
  const archived = { id: 'b', status: 'archived' as const }
  const other = { id: 'c', status: 'active' as const }

  expect(defaultProjectId([active, other], 'c')).toBe('c')
  // Архивный проект по умолчанию не выбирается, даже если был последним.
  expect(defaultProjectId([active, other], 'b')).toBe('a')
  expect(defaultProjectId([archived, other], null)).toBe('c')
  expect(defaultProjectId([], 'x')).toBe(null)
})

// Приглашение модели используется напрямую в тесте invite-формы; выведем базовые типы ролей.
expect(teamUser.orgRole).toBe('owner')
expect(clientLead.memberRole).toBe('client_lead')
expect(observer.memberRole).toBe('observer')

test('parseDateLocal строит локальную полночь (даты не сдвигаются на день)', () => {
  const date = parseDateLocal('2026-10-07')
  expect(date.getFullYear()).toBe(2026)
  expect(date.getMonth()).toBe(9)
  expect(date.getDate()).toBe(7)
  expect(date.getHours()).toBe(0)
})

test('toDateInputValue использует локальные компоненты даты', () => {
  const date = new Date(2026, 9, 7, 23, 30)
  expect(toDateInputValue(date)).toBe('2026-10-07')
  expect(toDateInputValue(null)).toBe('')
})
