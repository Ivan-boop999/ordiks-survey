import { describe, expect, test } from 'bun:test'

import {
  createProjectRequestSchema,
  createTaskRequestSchema,
  projectSettingsSchema,
  projectTemplateSchema,
  tasksQuerySchema,
  updateChecklistItemRequestSchema,
  updateTaskRequestSchema,
} from './index'

describe('project contracts', () => {
  test('fills the prototype dictionaries when settings are absent or partial', () => {
    expect(projectSettingsSchema.parse({})).toEqual({
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
      ],
      passportFields: [],
      passportValues: {},
    })

    const custom = projectSettingsSchema.parse({
      findingCategories: ['Процесс'],
      findingStatuses: [{ id: 'new', name: 'Новая' }],
      passportValues: { 'pf-1': '1200' },
    })
    expect(custom.findingStatuses).toEqual([{ id: 'new', name: 'Новая', color: 'gray' }])
    expect(custom.factTypes?.map((type) => type.key)).toEqual(['photo', 'file', 'note'])
    expect(custom.passportValues).toEqual({ 'pf-1': '1200' })

    expect(() =>
      projectSettingsSchema.parse({ findingStatuses: [{ id: 'x', name: 'X', color: 'pink' }] }),
    ).toThrow()
  })

  test('accepts a template object with groups, domains, and checklists', () => {
    const template = projectTemplateSchema.parse({
      stageNames: ['Подготовка', 'Выезд'],
      groups: ['Продажи и заказы', 'Производство'],
      domains: [
        { groupIndex: 0, name: 'Продажи и договоры', checklist: ['Как формируется заказ'] },
        { groupIndex: 1, name: 'Диспетчеризация' },
      ],
    })
    expect(template.domains[1].checklist).toEqual([])

    expect(() =>
      projectTemplateSchema.parse({
        stageNames: ['Этап'],
        groups: ['Группа'],
        domains: [{ groupIndex: 5, name: 'Не в той группе' }],
      }),
    ).not.toThrow()
    expect(() =>
      projectTemplateSchema.parse({ domains: [{ groupIndex: -1, name: 'Отрицательная группа' }] }),
    ).toThrow()
  })

  test('normalizes project create payloads and defaults the passport fields', () => {
    const request = createProjectRequestSchema.parse({
      name: '  ЖБИ-завод, Уфа  ',
      shops: ['Цех плит'],
    })
    expect(request.name).toBe('ЖБИ-завод, Уфа')
    expect(request.shops).toEqual(['Цех плит'])
    expect(request.settings).toBeUndefined()
    expect(request.template).toBeUndefined()

    expect(() => createProjectRequestSchema.parse({ name: 'Ж' })).toThrow()
    expect(() => createProjectRequestSchema.parse({ name: 'Проект', shops: ['  '] })).toThrow()
  })

  test('keeps task dates nullable and query filters uuid-shaped', () => {
    const task = createTaskRequestSchema.parse({
      title: 'Обойти цех плит',
      stageId: null,
      deadline: '2026-10-01T00:00:00.000Z',
    })
    expect(task.stageId).toBeNull()
    expect(task.deadline).toBeInstanceOf(Date)

    expect(updateTaskRequestSchema.parse({ deadline: null }).deadline).toBeNull()
    expect(updateTaskRequestSchema.parse({}).deadline).toBeUndefined()

    expect(
      tasksQuerySchema.parse({ stageId: '019c0000-0000-7000-8000-000000000001', status: 'doing' }),
    ).toEqual({ stageId: '019c0000-0000-7000-8000-000000000001', status: 'doing' })
    expect(() => tasksQuerySchema.parse({ stageId: 'not-a-uuid' })).toThrow()
    expect(() => tasksQuerySchema.parse({ status: 'later' })).toThrow()
  })

  test('checklist updates carry optional done and order', () => {
    expect(updateChecklistItemRequestSchema.parse({ done: true })).toEqual({ done: true })
    expect(() => updateChecklistItemRequestSchema.parse({ done: 'yes' })).toThrow()
  })
})
