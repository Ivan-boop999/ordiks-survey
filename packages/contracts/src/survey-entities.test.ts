import { describe, expect, test } from 'bun:test'

import {
  answerValueSchema,
  bulkUpdateFindingsRequestSchema,
  confirmFactUploadRequestSchema,
  createFactRequestSchema,
  createFactUploadRequestSchema,
  createGuideQuestionRequestSchema,
  createGuideRequestSchema,
  factsQuerySchema,
  factUploadTicketSchema,
  saveInterviewAnswersRequestSchema,
} from './index'

describe('survey entity contracts', () => {
  test('fact create defaults the type key to nothing and keeps the label file name optional', () => {
    const fact = createFactRequestSchema.parse({
      kind: 'photo',
      title: 'Журнал смены, цех плит',
      description: 'Мастер записывает вручную',
      shop: 'Цех плит',
    })
    expect(fact.typeKey).toBeUndefined()
    expect(fact.description).toBe('Мастер записывает вручную')
    expect(fact.domainId).toBeUndefined()

    const labeled = createFactRequestSchema.parse({
      kind: 'file',
      title: 'Выгрузка 1С: отгрузки 12 мес.',
      fileName: 'otgruzki_12m.xls',
    })
    expect(labeled.fileName).toBe('otgruzki_12m.xls')

    expect(() => createFactRequestSchema.parse({ kind: 'voice', title: 'Нет' })).toThrow()
  })

  test('fact upload ticket pins the http url and replayable headers', () => {
    const request = createFactUploadRequestSchema.parse({
      contentType: 'application/vnd.ms-excel',
      byteSize: 2048,
    })
    expect(request.contentType).toBe('application/vnd.ms-excel')

    expect(() => createFactUploadRequestSchema.parse({ contentType: 'xls', byteSize: 10 })).toThrow()
    expect(() => createFactUploadRequestSchema.parse({ contentType: 'image/png', byteSize: 0 })).toThrow()

    const ticket = factUploadTicketSchema.parse({
      token: 't',
      method: 'PUT',
      url: 'http://127.0.0.1:3000/storage/projects/x/facts/y?x-sig=1',
      headers: { 'Content-Type': 'image/png' },
      contentLength: 10,
      expiresAt: new Date().toISOString(),
    })
    expect(ticket.method).toBe('PUT')
    expect(() =>
      factUploadTicketSchema.parse({ ...ticket, url: 'javascript:alert(1)' }),
    ).toThrow()

    expect(confirmFactUploadRequestSchema.parse({ token: 't', fileName: 'a.png' }).fileName).toBe('a.png')
  })

  test('fact filters stay strict: unknown query keys are rejected', () => {
    expect(factsQuerySchema.parse({ kind: 'photo', q: 'журнал' })).toEqual({
      kind: 'photo',
      q: 'журнал',
    })
    expect(() => factsQuerySchema.parse({ shop: '' })).toThrow()
    expect(() => factsQuerySchema.parse({ type: 'photo' })).toThrow()
  })

  test('guide create carries sections with conditional questions', () => {
    const guide = createGuideRequestSchema.parse({
      name: 'Опросник: планирование производства',
      sections: [
        {
          title: 'Текущий процесс',
          questions: [
            { type: 'text', text: 'Как заказ превращается в план цеха?' },
            { type: 'yn', text: 'План фиксируется в единой системе?' },
            {
              type: 'text',
              text: 'Если нет — где живёт план?',
              showIfQuestionId: '019c0000-0000-7000-8000-000000000001',
              showIfValue: 'no',
            },
            { type: 'multi', text: 'Где живёт план сегодня?', options: ['Excel', '1С', 'Бумага'] },
          ],
        },
      ],
    })
    expect(guide.sections[0].questions).toHaveLength(4)
    expect(guide.sections[0].questions[1].options).toEqual([])
    expect(guide.sections[0].questions[3].options).toEqual(['Excel', '1С', 'Бумага'])

    expect(() =>
      createGuideQuestionRequestSchema.parse({ type: 'choice', text: 'Варианты?' }),
    ).not.toThrow()
  })

  test('answer values accept strings, numbers, option arrays, and null', () => {
    expect(answerValueSchema.parse('да')).toBe('да')
    expect(answerValueSchema.parse(3)).toBe(3)
    expect(answerValueSchema.parse(['Excel', 'Бумага'])).toEqual(['Excel', 'Бумага'])
    expect(answerValueSchema.parse(null)).toBeNull()
    expect(() => answerValueSchema.parse(true)).toThrow()

    const batch = saveInterviewAnswersRequestSchema.parse({
      answers: [
        { questionId: '019c0000-0000-7000-8000-000000000001', value: 'no' },
        { questionId: '019c0000-0000-7000-8000-000000000002', value: null },
      ],
    })
    expect(batch.answers).toHaveLength(2)
  })

  test('finding bulk update takes a bounded id list and a status string', () => {
    const bulk = bulkUpdateFindingsRequestSchema.parse({
      ids: ['019c0000-0000-7000-8000-000000000001'],
      status: 'confirmed',
    })
    expect(bulk.status).toBe('confirmed')
    expect(() => bulkUpdateFindingsRequestSchema.parse({ ids: [], status: 'confirmed' })).toThrow()
  })
})
