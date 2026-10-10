import { describe, expect, test } from 'bun:test'

import { gapDto, quickWinDto, riskDto } from './analytics-service'
import type { GapRow, QuickWinRow, RiskRow } from './ports'

const now = new Date('2026-10-10T12:00:00.000Z')

const risk = (over: Partial<RiskRow> = {}): RiskRow => ({
  id: 'r1',
  projectId: 'p1',
  domainId: null,
  ownerId: null,
  title: 'Срыв данных',
  probability: 4,
  impact: 3,
  status: 'open',
  mitigation: '',
  createdAt: now,
  ...over,
})

describe('критичность рисков считается в DTO, не хранится', () => {
  test('criticality = вероятность × влияние', () => {
    expect(riskDto(risk()).criticality).toBe(12)
    expect(riskDto(risk({ probability: 5, impact: 5 })).criticality).toBe(25)
    expect(riskDto(risk({ probability: 1, impact: 1 })).criticality).toBe(1)
    // Границы enum: 1..25
    expect(riskDto(risk({ probability: 3, impact: 4 })).criticality).toBe(12)
  })

  test('DTO рисков переносит все поля', () => {
    const dto = riskDto(risk({ ownerId: 'u1', domainId: 'd1', status: 'mitigated', mitigation: 'План' }))
    expect(dto).toMatchObject({ id: 'r1', projectId: 'p1', domainId: 'd1', ownerId: 'u1', status: 'mitigated', mitigation: 'План' })
  })
})

describe('GAP и quick win DTO', () => {
  test('gapDto: kind/status как в строке', () => {
    const row: GapRow = {
      id: 'g1',
      projectId: 'p1',
      domainId: 'd1',
      findingId: null,
      requirement: 'Единый план',
      kind: 'std',
      status: 'agreed',
      comment: '',
      createdAt: now,
    }
    expect(gapDto(row)).toMatchObject({ requirement: 'Единый план', kind: 'std', status: 'agreed' })
  })

  test('quickWinDto: статус и усилие', () => {
    const row: QuickWinRow = {
      id: 'q1',
      projectId: 'p1',
      domainId: null,
      title: 'Ярлыки на склад',
      effect: 'Быстрее поиск',
      effort: 'средний',
      status: 'accepted',
      createdAt: now,
    }
    expect(quickWinDto(row)).toMatchObject({ title: 'Ярлыки на склад', effort: 'средний', status: 'accepted' })
  })
})
