import { expect, test } from 'bun:test'

import type { z } from 'zod'

import type { AuthenticatedTransport } from '../src/platform/api'
import { createInvite, deactivateInvite, duplicateGuide } from '../src/features/survey/api'
import { inviteLinkUrl, inviteManagePayload } from '../src/features/survey/invite-model'

const PROJECT_ID = '123e4567-e89b-12d3-a456-426614174000'

const inviteFixture = {
  id: 'inv_1',
  code: 'UFA-2026-KQ4ZT',
  projectId: PROJECT_ID,
  orgRole: 'client',
  memberRole: 'client_lead',
  note: 'для главного технолога',
  createdById: 'usr_1',
  usedById: null,
  usedAt: null,
  expiresAt: null,
  createdAt: '2026-10-10T00:00:00.000Z',
  active: true,
}

/** Транспорт-рекордер: запоминает запросы и прогоняет фикстуру через схему ответа. */
function recordingTransport(fixture: unknown) {
  const calls: Array<{ path: string; method: string; body?: unknown }> = []
  const transport = {
    request: (
      path: string,
      schema: z.ZodType,
      options: { method?: string; body?: unknown } = {},
    ) => {
      calls.push({ path, method: options.method ?? 'GET', body: options.body })
      return Promise.resolve(schema.parse(fixture))
    },
  } as unknown as AuthenticatedTransport
  return { calls, transport }
}

test('invite manage payload binds the project with a member role and trims the note', () => {
  const result = inviteManagePayload(
    { orgRole: 'client', withProject: true, memberRole: 'client_lead', note: '  для технолога  ' },
    PROJECT_ID,
  )
  expect(result.errors).toEqual({})
  expect(result.payload).toEqual({
    orgRole: 'client',
    projectId: PROJECT_ID,
    memberRole: 'client_lead',
    note: 'для технолога',
  })

  const withoutProject = inviteManagePayload(
    { orgRole: 'analyst', withProject: false, memberRole: 'client_lead', note: '' },
    PROJECT_ID,
  )
  expect(withoutProject.errors).toEqual({})
  expect(withoutProject.payload && 'projectId' in withoutProject.payload).toBe(false)
  expect(withoutProject.payload && 'memberRole' in withoutProject.payload).toBe(false)
})

test('createInvite posts to /api/invites and returns the invite with its code', async () => {
  const { calls, transport } = recordingTransport(inviteFixture)
  const invite = await createInvite(transport, {
    orgRole: 'client',
    projectId: PROJECT_ID,
    memberRole: 'client_lead',
    note: 'для главного технолога',
  })

  expect(invite.code).toBe('UFA-2026-KQ4ZT')
  expect(invite.memberRole).toBe('client_lead')
  expect(invite.active).toBe(true)
  expect(calls).toEqual([
    {
      path: '/api/invites',
      method: 'POST',
      body: {
        orgRole: 'client',
        projectId: PROJECT_ID,
        memberRole: 'client_lead',
        note: 'для главного технолога',
      },
    },
  ])
})

test('deactivateInvite issues DELETE against the invite id', async () => {
  const { calls, transport } = recordingTransport({ ...inviteFixture, active: false })
  const invite = await deactivateInvite(transport, 'inv_1')
  expect(invite.active).toBe(false)
  expect(calls).toEqual([{ path: '/api/invites/inv_1', method: 'DELETE' }])
})

test('duplicateGuide posts to the duplicate endpoint and validates the copied tree', async () => {
  const guideFixture = {
    id: 'g_1',
    projectId: PROJECT_ID,
    name: 'Интервью (копия)',
    createdAt: '2026-10-10T00:00:00.000Z',
    sections: [
      {
        id: 's_1',
        guideId: 'g_1',
        title: 'Учёт',
        sortOrder: 0,
        questions: [
          {
            id: 'q_1',
            sectionId: 's_1',
            type: 'yn',
            text: 'Есть журнал?',
            options: [],
            showIfQuestionId: null,
            showIfValue: null,
            sortOrder: 0,
          },
        ],
      },
    ],
  }
  const { calls, transport } = recordingTransport(guideFixture)
  const guide = await duplicateGuide(transport, 'g_1')

  expect(guide.name).toBe('Интервью (копия)')
  expect(guide.sections[0].questions[0].text).toBe('Есть журнал?')
  expect(calls).toEqual([{ path: '/api/guides/g_1/duplicate', method: 'POST' }])
})

test('invite link points at /invite with the encoded code', () => {
  expect(inviteLinkUrl('UFA-2026-KQ4ZT', 'https://app.ordiks.ru')).toBe(
    'https://app.ordiks.ru/invite?code=UFA-2026-KQ4ZT',
  )
  expect(inviteLinkUrl('код с пробелами', 'https://app.ordiks.ru/')).toBe(
    'https://app.ordiks.ru/invite?code=%D0%BA%D0%BE%D0%B4%20%D1%81%20%D0%BF%D1%80%D0%BE%D0%B1%D0%B5%D0%BB%D0%B0%D0%BC%D0%B8',
  )
})
