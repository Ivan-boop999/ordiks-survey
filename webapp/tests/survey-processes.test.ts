import { describe, expect, test } from 'bun:test'
import type { ProcessDto, ProcessStepDto } from '@ordiks-survey/contracts'

import {
  MAP_TO_NONE,
  MAP_TO_UNSET,
  mapToPatch,
  mapToSelectValue,
  moveStepIds,
  numberedStepLabel,
  stepsOfSide,
} from '../src/features/survey/processes-model'
import { runSchemeUploadFlow } from '../src/features/survey/process-scheme-upload'

function step(overrides: Partial<ProcessStepDto> & { id: string; sortOrder: number }): ProcessStepDto {
  return {
    processId: 'p1',
    side: 'asis',
    title: 'Шаг',
    actorRole: '',
    tools: [],
    effect: null,
    mapToStepId: null,
    disappears: false,
    ...overrides,
  }
}

function process(steps: ProcessStepDto[]): ProcessDto {
  return {
    id: 'proc-1',
    projectId: 'proj-1',
    name: 'Продажи',
    steps,
    schemes: [],
  }
}

describe('шаги сторон', () => {
  test('stepsOfSide сортирует по sortOrder и фильтрует по стороне', () => {
    const asisSecond = step({ id: 'a2', sortOrder: 2, title: 'Второй' })
    const asisFirst = step({ id: 'a1', sortOrder: 1, title: 'Первый' })
    const tobeOnly = step({ id: 't1', sortOrder: 1, side: 'tobe', title: 'Цель' })
    const result = stepsOfSide(process([asisSecond, asisFirst, tobeOnly]), 'asis')
    expect(result.map((item) => item.id)).toEqual(['a1', 'a2'])
  })
})

describe('mapTo-селект сравнения', () => {
  test('значение селекта: id шага TO-BE, none для исчезновения, пусто для неопределённости', () => {
    expect(mapToSelectValue(step({ id: 'a1', sortOrder: 1, mapToStepId: 't9' }))).toBe('t9')
    expect(mapToSelectValue(step({ id: 'a2', sortOrder: 1, disappears: true }))).toBe(MAP_TO_NONE)
    expect(mapToSelectValue(step({ id: 'a3', sortOrder: 1 }))).toBe(MAP_TO_UNSET)
  })

  test('патч из селекта и запрет «исчезает + mapTo» одновременно', () => {
    expect(mapToPatch('t9')).toEqual({ mapToStepId: 't9', disappears: false })
    expect(mapToPatch(MAP_TO_NONE)).toEqual({ mapToStepId: null, disappears: true })
    expect(mapToPatch(MAP_TO_UNSET)).toEqual({ mapToStepId: null, disappears: false })
    // Контракт требует: исчезающий шаг не ссылается на TO-BE — патч это гарантирует.
    const disappearing = mapToPatch(MAP_TO_NONE)
    expect(disappearing.mapToStepId).toBeNull()
    expect(disappearing.disappears).toBe(true)
  })

  test('round-trip: selectValue → patch → selectValue', () => {
    for (const source of [step({ id: 'a', sortOrder: 1 }), step({ id: 'b', sortOrder: 1, mapToStepId: 't1' }), step({ id: 'c', sortOrder: 1, disappears: true })]) {
      const restored = { ...source, ...mapToPatch(mapToSelectValue(source)) }
      expect(mapToSelectValue(restored)).toBe(mapToSelectValue(source))
    }
  })
})

describe('порядок шагов', () => {
  test('moveStepIds меняет соседей и не трогает границы', () => {
    const ids = ['a', 'b', 'c']
    expect(moveStepIds(ids, 0, -1)).toBe(ids)
    expect(moveStepIds(ids, 2, 1)).toBe(ids)
    expect(moveStepIds(ids, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveStepIds(ids, 1, 1)).toEqual(['a', 'c', 'b'])
  })

  test('numberedStepLabel нумерует опции селекта с 1', () => {
    expect(numberedStepLabel(step({ id: 't1', sortOrder: 1, title: 'Отгрузка' }), 3)).toBe('3. Отгрузка')
  })
})

describe('загрузка схемы процесса', () => {
  test('runSchemeUploadFlow: тикет → PUT → confirm с именем файла', async () => {
    const calls: string[] = []
    await runSchemeUploadFlow(
      {
        requestTicket: async (input) => {
          calls.push(`ticket:${input.contentType}:${input.byteSize}`)
          return {
            token: 'tok-1',
            method: 'PUT',
            url: 'http://127.0.0.1:9/storage/schemes/x?sig=1',
            headers: { 'Content-Type': 'image/svg+xml' },
            contentLength: input.byteSize,
            expiresAt: '2026-10-10T00:00:00.000Z',
          }
        },
        putObject: async (ticket, blob) => {
          calls.push(`put:${ticket.token}:${blob.size}`)
        },
        confirm: async (input) => {
          calls.push(`confirm:${input.token}:${input.fileName}`)
        },
      },
      { blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }), fileName: 'scheme.svg', contentType: 'image/svg+xml' },
    )

    expect(calls).toEqual([
      'ticket:image/svg+xml:6',
      'put:tok-1:6',
      'confirm:tok-1:scheme.svg',
    ])
  })

  test('ошибка подтверждения не глотается', async () => {
    await expect(
      runSchemeUploadFlow(
        {
          requestTicket: async () => ({
            token: 'tok-2',
            method: 'PUT',
            url: 'http://127.0.0.1:9/storage/schemes/y?sig=1',
            headers: {},
            contentLength: 1,
            expiresAt: '2026-10-10T00:00:00.000Z',
          }),
          putObject: async () => undefined,
          confirm: async () => {
            throw new Error('409: upload incomplete')
          },
        },
        { blob: new Blob(['x']), fileName: 's.png', contentType: 'image/png' },
      ),
    ).rejects.toThrow('409')
  })
})
