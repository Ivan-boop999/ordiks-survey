import type { AnswerValue, GuideQuestionType } from '@ordiks-survey/contracts'

/**
 * Условия показа и типы вопросов гайда — чистая логика сохранения ответов интервью
 * (повторение прототипа: Forms['iv.answers'] и qCondMet).
 *
 * Правила:
 * - неизвестный гайду questionId — ошибка валидации (гайд изменился, клиент должен перечитать);
 * - значение должно соответствовать типу вопроса (yn — yes/no, scale — 1..5, choice/multi —
 *   варианты из options, text — строка);
 * - null/пусто — «не отвечено», не сохраняется;
 * - ответ на условный вопрос, чьё условие не выполнено в этом же батче, отбрасывается молча:
 *   скрытого вопроса в интервью нет (в прототипе поле просто не попадает в форму).
 */

export type GuideQuestionDef = {
  id: string
  type: GuideQuestionType
  options: string[]
  showIfQuestionId: string | null
  showIfValue: string | null
}

export type SubmittedAnswer = {
  questionId: string
  value: AnswerValue
}

export type AnswerBatchResult = {
  /// Ответы, которые дошли до сохранения, в порядке гайда.
  answers: Array<{ questionId: string; value: Exclude<AnswerValue, null> }>
  /// Ответы, отброшенные как «скрытые условным вопросом» (для диагностики и тестов).
  droppedByCondition: string[]
}

export type AnswerValidationError = {
  questionId: string
  message: string
}

/** Ответ на вопрос-источник условия как строка для сравнения с showIfValue (как в прототипе). */
function conditionSourceValue(answer: unknown): string | null {
  if (answer === null || answer === undefined) return null
  if (typeof answer === 'string') return answer === '' ? null : answer
  if (typeof answer === 'number') return String(answer)
  return null
}

function isConditionMet(
  question: GuideQuestionDef,
  saved: Map<string, unknown>,
  knownIds: Set<string>,
): boolean {
  if (!question.showIfQuestionId || !question.showIfValue) return true
  // Источник удалён из гайда — вопрос показывается безусловно (прототип: «не блокируем опросник»).
  if (!knownIds.has(question.showIfQuestionId)) return true
  return conditionSourceValue(saved.get(question.showIfQuestionId)) === question.showIfValue
}

function normalizeValue(question: GuideQuestionDef, value: AnswerValue): { ok: true; value: Exclude<AnswerValue, null> } | { ok: false; message: string } {
  switch (question.type) {
    case 'text':
      if (typeof value !== 'string') return { ok: false, message: 'Answer must be a string' }
      if (value.trim() === '') return { ok: true, value: '' }
      return { ok: true, value }
    case 'yn':
      if (value !== 'yes' && value !== 'no') {
        return { ok: false, message: 'Answer must be "yes" or "no"' }
      }
      return { ok: true, value }
    case 'scale': {
      const accepted = typeof value === 'number' ? String(value) : value
      if (typeof accepted !== 'string' || !/^[1-5]$/.test(accepted)) {
        return { ok: false, message: 'Answer must be an integer from 1 to 5' }
      }
      // Нормализуем к строке, как их хранит и показывает прототип.
      return { ok: true, value: accepted }
    }
    case 'choice': {
      if (typeof value !== 'string') return { ok: false, message: 'Answer must be a string' }
      if (!question.options.includes(value)) {
        return { ok: false, message: 'Answer must be one of the question options' }
      }
      return { ok: true, value }
    }
    case 'multi': {
      if (!Array.isArray(value)) return { ok: false, message: 'Answer must be an array of options' }
      const unknown = value.find((option) => !question.options.includes(option))
      if (unknown !== undefined) {
        return { ok: false, message: `Answer option "${unknown}" is not one of the question options` }
      }
      return { ok: true, value: [...new Set(value)] }
    }
  }
}

/**
 * Валидирует save-батч по гайду и возвращает то, что должно быть сохранено. Порядок вопросов —
 * порядок гайда, а не присланного массива: условия проверяются по уже принятым ответам,
 * поэтому исходный вопрос обязан встретиться раньше зависимого.
 */
export function buildAnswerBatch(
  questions: GuideQuestionDef[],
  submitted: SubmittedAnswer[],
): { ok: true; result: AnswerBatchResult } | { ok: false; errors: AnswerValidationError[] } {
  const byId = new Map(questions.map((question) => [question.id, question]))
  const submittedById = new Map<string, AnswerValue>()
  const errors: AnswerValidationError[] = []

  for (const answer of submitted) {
    if (!byId.has(answer.questionId)) {
      errors.push({ questionId: answer.questionId, message: 'Question does not belong to this guide' })
      continue
    }
    // Повтор questionId: прототип держит один ответ на вопрос — берём последний.
    submittedById.set(answer.questionId, answer.value)
  }
  if (errors.length > 0) return { ok: false, errors }

  const accepted = new Map<string, Exclude<AnswerValue, null>>()
  for (const question of questions) {
    const value = submittedById.get(question.id)
    // null и отсутствующий ответ — «не отвечено»: не сохраняется и не является ошибкой.
    if (value === undefined || value === null) continue

    const normalized = normalizeValue(question, value)
    if (!normalized.ok) {
      errors.push({ questionId: question.id, message: normalized.message })
      continue
    }
    if (normalized.value === '' || (Array.isArray(normalized.value) && normalized.value.length === 0)) {
      continue
    }
    accepted.set(question.id, normalized.value)
  }
  if (errors.length > 0) return { ok: false, errors }

  const droppedByCondition: string[] = []
  const answers: Array<{ questionId: string; value: Exclude<AnswerValue, null> }> = []
  const knownIds = new Set(questions.map((question) => question.id))
  for (const question of questions) {
    const value = accepted.get(question.id)
    if (value === undefined) continue
    if (!isConditionMet(question, accepted, knownIds)) {
      droppedByCondition.push(question.id)
      continue
    }
    answers.push({ questionId: question.id, value })
  }

  return { ok: true, result: { answers, droppedByCondition } }
}
