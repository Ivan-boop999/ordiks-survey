import { describe, expect, test } from 'bun:test'

import {
  acceptInviteRequestSchema,
  createInviteRequestSchema,
  inviteSchema,
} from './index'

const invite = {
  id: '019c0000-0000-7000-8000-00000000000a',
  code: 'UFA-2026',
  projectId: null,
  orgRole: 'client',
  memberRole: null,
  note: 'для команды заказчика',
  createdById: '019c0000-0000-7000-8000-00000000000b',
  usedById: null,
  usedAt: null,
  expiresAt: null,
  createdAt: '2026-10-10T00:00:00.000Z',
  active: true,
} as const

describe('invite contracts', () => {
  test('round-trips the invite DTO', () => {
    expect(inviteSchema.parse(invite)).toEqual(invite)
    expect(() => inviteSchema.parse({ ...invite, active: 'yes' as unknown as boolean })).toThrow()
    expect(() => inviteSchema.parse({ ...invite, orgRole: 'root' })).toThrow()
  })

  test('requires a member role exactly when the invite targets a project', () => {
    expect(
      createInviteRequestSchema.parse({ orgRole: 'client', memberRole: 'client_lead' }),
    ).toEqual({ orgRole: 'client', memberRole: 'client_lead', note: '' })

    expect(
      createInviteRequestSchema.parse({
        orgRole: 'analyst',
        projectId: '019c0000-0000-7000-8000-000000000001',
        memberRole: 'analyst',
        note: 'в команду на ЖБИ',
        expiresAt: '2026-11-01T00:00:00.000Z',
      }).expiresAt,
    ).toBeInstanceOf(Date)

    expect(() =>
      createInviteRequestSchema.parse({
        orgRole: 'client',
        projectId: '019c0000-0000-7000-8000-000000000001',
      }),
    ).toThrow()
    expect(() =>
      createInviteRequestSchema.parse({ orgRole: 'client', memberRole: 'client_lead', extra: 1 }),
    ).toThrow()
  })

  test('accepts invite signups with the standard password policy', () => {
    const request = acceptInviteRequestSchema.parse({
      code: '  UFA-2026  ',
      email: '  RUSTEM@demo.ordiks.ru  ',
      password: 'password123',
    })
    expect(request.code).toBe('UFA-2026')
    expect(request.email).toBe('rustem@demo.ordiks.ru')

    expect(() =>
      acceptInviteRequestSchema.parse({ code: 'UF', email: 'a@b.ru', password: 'password123' }),
    ).toThrow()
    expect(() =>
      acceptInviteRequestSchema.parse({ code: 'UFA-2026', email: 'a@b.ru', password: 'short' }),
    ).toThrow()
  })
})
