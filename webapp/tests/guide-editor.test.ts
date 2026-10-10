import { expect, test } from 'bun:test'

import type { GuideDto, GuideQuestionDto } from '@ordiks-survey/contracts'

import {
  conditionOptions,
  decodeCondition,
  draftFromQuestion,
  encodeCondition,
  optionsToText,
  parseOptionsText,
  questionPayloadFromDraft,
  questionTypeHasOptions,
  questionUpdatePayloadFromDraft,
} from '../src/features/survey/guide-model'

const ynQuestion: GuideQuestionDto = {
  id: '11111111-1111-4111-8111-111111111111',
  sectionId: '21111111-1111-4111-8111-111111111111',
  type: 'yn',
  text: 'Есть электронный журнал?',
  options: [],
  showIfQuestionId: null,
  showIfValue: null,
  sortOrder: 0,
}

const choiceQuestion: GuideQuestionDto = {
  ...ynQuestion,
  id: '12121212-1212-4121-8121-121212121212',
  type: 'choice',
  text: 'В чём ведёте учёт?',
  options: ['Excel', '1С', 'На бумаге'],
  sortOrder: 1,
}

const conditionalQuestion: GuideQuestionDto = {
  ...ynQuestion,
  id: '13131313-1313-4131-8131-131313131313',
  type: 'text',
  text: 'Какой именно журнал?',
  showIfQuestionId: ynQuestion.id,
  showIfValue: 'yes',
  sortOrder: 2,
}

const guide: GuideDto = {
  id: '31313131-3131-4131-8131-313131313131',
  projectId: '41414141-4141-4141-8141-414141414141',
  name: 'Интервью с технологом',
  createdAt: '2026-10-01T00:00:00.000Z',
  sections: [
    {
      id: ynQuestion.sectionId,
      guideId: '31313131-3131-4131-8131-313131313131',
      title: 'Учёт',
      sortOrder: 0,
      questions: [ynQuestion, choiceQuestion, conditionalQuestion],
    },
  ],
}

test('question constructor round-trips a draft from an existing conditional question', () => {
  const draft = draftFromQuestion(conditionalQuestion)
  expect(draft.type).toBe('text')
  expect(draft.text).toBe('Какой именно журнал?')
  expect(draft.condition).toBe(encodeCondition(ynQuestion.id, 'yes'))

  const restored = decodeCondition(draft.condition)
  expect(restored).toEqual({ questionId: ynQuestion.id, answerValue: 'yes' })
})

test('question constructor builds a create payload with a decoded show condition', () => {
  const draft = {
    type: 'text' as const,
    text: '  Какой именно журнал?  ',
    optionsText: '',
    condition: encodeCondition(ynQuestion.id, 'yes'),
  }
  const { errors, payload } = questionPayloadFromDraft(draft)
  expect(errors).toEqual({})
  expect(payload).not.toBe(null)
  expect(payload && payload.text).toBe('Какой именно журнал?')
  expect(payload && payload.showIfQuestionId).toBe(ynQuestion.id)
  expect(payload && payload.showIfValue).toBe('yes')
  // Текстовый вопрос не несёт вариантов — options очищаются.
  expect(payload && payload.options).toEqual([])
})

test('question constructor parses choice options from textarea lines and keeps them', () => {
  const draft = {
    type: 'choice' as const,
    text: 'В чём ведёте учёт?',
    optionsText: ' Excel \n1С\n\n  На бумаге  ',
    condition: '',
  }
  const { errors, payload } = questionPayloadFromDraft(draft)
  expect(errors).toEqual({})
  expect(payload && payload.options).toEqual(['Excel', '1С', 'На бумаге'])
  expect(payload && payload.showIfQuestionId).toBe(null)
  expect(payload && payload.showIfValue).toBe(null)

  expect(parseOptionsText(' A\nB ')).toEqual(['A', 'B'])
  expect(optionsToText(['A', 'B'])).toBe('A\nB')
})

test('question constructor rejects invalid drafts with per-field errors', () => {
  const empty = questionPayloadFromDraft({ type: 'choice', text: '   ', optionsText: '\n  \n', condition: '' })
  expect(empty.payload).toBe(null)
  expect(empty.errors.text).toBeTruthy()
  expect(empty.errors.options).toBeTruthy()

  const badCondition = questionPayloadFromDraft({
    type: 'yn',
    text: 'Вопрос',
    optionsText: '',
    condition: 'сломанное-условие-без-разделителя',
  })
  expect(badCondition.payload).toBe(null)
  expect(badCondition.errors.condition).toBeTruthy()

  const update = questionUpdatePayloadFromDraft({
    type: 'multi',
    text: 'Что используете?',
    optionsText: 'Excel\n1С',
    condition: '',
  })
  expect(update.errors).toEqual({})
  expect(update.payload && update.payload.type).toBe('multi')
})

test('condition options list only earlier yes/no and choice questions with their values', () => {
  // Для нового вопроса в конец доступны оба источника: да/нет и choice.
  const forNew = conditionOptions(guide, null)
  expect(forNew.some((option) => option.questionId === ynQuestion.id && option.answerValue === 'yes')).toBe(true)
  expect(forNew.some((option) => option.questionId === ynQuestion.id && option.answerValue === 'no')).toBe(true)
  expect(forNew.filter((option) => option.questionId === choiceQuestion.id).map((option) => option.answerValue))
    .toEqual(['Excel', '1С', 'На бумаге'])

  // Для редактирования третьего вопроса источники — только предыдущие.
  const forThird = conditionOptions(guide, conditionalQuestion.id)
  expect(forThird.every((option) => option.questionId !== conditionalQuestion.id)).toBe(true)
  expect(forThird.length).toBe(5)

  expect(questionTypeHasOptions('choice')).toBe(true)
  expect(questionTypeHasOptions('multi')).toBe(true)
  expect(questionTypeHasOptions('text')).toBe(false)
})
