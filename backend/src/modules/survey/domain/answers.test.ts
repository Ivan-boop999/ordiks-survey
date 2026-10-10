import { describe, expect, test } from 'bun:test'

import { buildAnswerBatch, type GuideQuestionDef } from './answers'

const questions: GuideQuestionDef[] = [
  { id: 'q1', type: 'text', options: [], showIfQuestionId: null, showIfValue: null },
  { id: 'q2', type: 'yn', options: [], showIfQuestionId: null, showIfValue: null },
  // Условный: показывается только когда q2 = no (как в демо-гайде прототипа).
  { id: 'q3', type: 'text', options: [], showIfQuestionId: 'q2', showIfValue: 'no' },
  { id: 'q4', type: 'scale', options: [], showIfQuestionId: null, showIfValue: null },
  { id: 'q5', type: 'choice', options: ['Вытесняют план', 'Вставляются в окна'], showIfQuestionId: null, showIfValue: null },
  { id: 'q6', type: 'multi', options: ['Excel', '1С', 'Бумага'], showIfQuestionId: null, showIfValue: null },
]

describe('buildAnswerBatch', () => {
  test('keeps a conditional answer when the condition is met (i2: answered "no")', () => {
    const result = buildAnswerBatch(questions, [
      { questionId: 'q1', value: 'Заказ попадает в Excel ПДО' },
      { questionId: 'q2', value: 'no' },
      { questionId: 'q3', value: 'План месяца — в Excel у ПДО' },
      { questionId: 'q4', value: '2' },
      { questionId: 'q5', value: 'Вытесняют план' },
      { questionId: 'q6', value: ['Excel', 'Бумага', 'Excel'] },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.droppedByCondition).toEqual([])
    expect(result.result.answers.map((answer) => answer.questionId)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'])
    // multi дедуплицируется; scale нормализуется к строке прототипа.
    expect(result.result.answers.find((answer) => answer.questionId === 'q6')?.value).toEqual(['Excel', 'Бумага'])
    expect(result.result.answers.find((answer) => answer.questionId === 'q4')?.value).toBe('2')
  })

  test('drops the conditional answer when the condition is not met (yes)', () => {
    const result = buildAnswerBatch(questions, [
      { questionId: 'q2', value: 'yes' },
      { questionId: 'q3', value: 'В единой системе' },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.droppedByCondition).toEqual(['q3'])
    expect(result.result.answers.map((answer) => answer.questionId)).toEqual(['q2'])
  })

  test('drops the conditional answer when the source was never answered', () => {
    const result = buildAnswerBatch(questions, [{ questionId: 'q3', value: 'Где-то' }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.droppedByCondition).toEqual(['q3'])
    expect(result.result.answers).toEqual([])
  })

  test('drops unanswered (null) and empty answers instead of storing them', () => {
    const result = buildAnswerBatch(questions, [
      { questionId: 'q1', value: null },
      { questionId: 'q2', value: 'no' },
      { questionId: 'q3', value: '' },
      { questionId: 'q6', value: [] },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.answers.map((answer) => answer.questionId)).toEqual(['q2'])
    expect(result.result.droppedByCondition).toEqual([])
  })

  test('accepts a scale answer as a number and normalizes it to a string', () => {
    const result = buildAnswerBatch(questions, [{ questionId: 'q4', value: 4 }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.answers[0]?.value).toBe('4')
  })

  test('rejects answers with wrong types for the guide', () => {
    expect(!buildAnswerBatch(questions, [{ questionId: 'q2', value: 'maybe' }]).ok).toBe(true)
    expect(!buildAnswerBatch(questions, [{ questionId: 'q2', value: 'да' }]).ok).toBe(true)
    expect(!buildAnswerBatch(questions, [{ questionId: 'q4', value: '6' }]).ok).toBe(true)
    expect(!buildAnswerBatch(questions, [{ questionId: 'q4', value: 0 }]).ok).toBe(true)
    expect(!buildAnswerBatch(questions, [{ questionId: 'q5', value: 'Другое' }]).ok).toBe(true)
    expect(!buildAnswerBatch(questions, [{ questionId: 'q6', value: 'Excel' }]).ok).toBe(true)
    expect(!buildAnswerBatch(questions, [{ questionId: 'q6', value: ['Access'] }]).ok).toBe(true)
    expect(!buildAnswerBatch(questions, [{ questionId: 'q1', value: 42 }]).ok).toBe(true)
  })

  test('rejects a question that is not in the guide', () => {
    const result = buildAnswerBatch(questions, [{ questionId: 'q9', value: 'x' }])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]?.message).toContain('not belong to this guide')
  })

  test('takes the last answer when a question id repeats', () => {
    const result = buildAnswerBatch(questions, [
      { questionId: 'q2', value: 'yes' },
      { questionId: 'q2', value: 'no' },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.answers).toEqual([{ questionId: 'q2', value: 'no' }])
  })

  test('a question whose source was deleted shows unconditionally (prototype: не блокируем опросник)', () => {
    const orphan: GuideQuestionDef = {
      id: 'q3',
      type: 'text',
      options: [],
      showIfQuestionId: 'deleted',
      showIfValue: 'no',
    }
    const result = buildAnswerBatch([orphan], [{ questionId: 'q3', value: 'Ответ' }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result.answers).toEqual([{ questionId: 'q3', value: 'Ответ' }])
  })
})
