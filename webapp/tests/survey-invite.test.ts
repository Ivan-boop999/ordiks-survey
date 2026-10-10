import { expect, test } from 'bun:test'

import { validateInviteForm } from '../src/features/survey/invite-model'
import { acceptInvite } from '../src/features/survey/api'
import { ApiRequestError, HttpClient } from '../src/platform/api'

test('invite form validates required fields with per-field errors before any request', () => {
  const empty = validateInviteForm({ code: '', email: '', displayName: '', password: '' })
  expect(empty.data).toBe(null)
  expect(Object.keys(empty.errors).sort()).toEqual(['code', 'email', 'password'])

  const shortPassword = validateInviteForm({
    code: 'UFA-2026',
    email: 'rustem@demo.ordiks.ru',
    displayName: 'Рустем Гареев',
    password: 'short',
  })
  expect(shortPassword.data).toBe(null)
  expect(shortPassword.errors.password?.length).toBeGreaterThan(0)

  const badEmail = validateInviteForm({
    code: 'UFA-2026',
    email: 'не-почта',
    displayName: '',
    password: 'ordiks-demo',
  })
  expect(badEmail.data).toBe(null)
  expect(badEmail.errors.email?.length).toBeGreaterThan(0)
})

test('invite form passes a valid submission through and trims the code', () => {
  const valid = validateInviteForm({
    code: '  UFA-2026  ',
    email: 'Rustem@Demo.Ordiks.RU ',
    displayName: 'Рустем Гареев',
    password: 'ordiks-demo',
  })
  expect(valid.errors).toEqual({})
  expect(valid.data).toEqual({
    code: 'UFA-2026',
    // Схема email в contracts нормализует регистр.
    email: expect.stringContaining('rustem@demo.ordiks.ru') as unknown,
    password: 'ordiks-demo',
    displayName: 'Рустем Гареев',
  })
})

test('invite form treats an optional display name as absent when blank', () => {
  const { data } = validateInviteForm({
    code: 'UFA-2026',
    email: 'marat@demo.ordiks.ru',
    displayName: '   ',
    password: 'ordiks-demo',
  })
  expect(data).not.toBe(null)
  expect(data && 'displayName' in data).toBe(false)
})

test('acceptInvite posts to the public endpoint and surfaces backend errors', async () => {
  const requests: Array<{ path: string; method: string; body: unknown }> = []
  const http = new HttpClient('https://api.invalid')
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      path: new URL(String(input)).pathname,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    })
    return new Response(
      JSON.stringify({ error: { code: 'INVITE_INVALID', message: 'Код не найден' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }) as typeof fetch

  try {
    await acceptInvite(
      { code: 'NOPE-1', email: 'x@example.com', password: 'long-enough' },
      http,
    )
    throw new Error('acceptInvite should have thrown')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).status).toBe(400)
    expect((error as ApiRequestError).message).toBe('Код не найден')
  } finally {
    globalThis.fetch = originalFetch
  }

  expect(requests).toEqual([
    {
      path: '/api/invites/accept',
      method: 'POST',
      body: { code: 'NOPE-1', email: 'x@example.com', password: 'long-enough' },
    },
  ])
})
