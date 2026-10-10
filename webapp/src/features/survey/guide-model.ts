import type {
  AnswerValue,
  GuideDto,
  GuideQuestionDto,
  InterviewAnswerDto,
} from '@ordiks-survey/contracts'

// ============================================================
// Гайды и ответы: чистая логика условных вопросов — экраны и
// тесты считают видимость/сохранение одинаково (как bindGuideConditions
// и Forms['iv.answers'] прототипа).
// ============================================================

export type AnswerDraft = Record<string, AnswerValue | undefined>

export const GUIDE_QUESTION_TYPE_LABELS: Record<GuideQuestionDto['type'], string> = {
  text: 'Текст',
  yn: 'Да / Нет',
  scale: 'Шкала 1–5',
  choice: 'Выбор одного',
  multi: 'Выбор нескольких',
}

/** Подписи шкалы (как answerInput прототипа). */
export const SCALE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '1', label: '1 — категорически нет' },
  { value: '2', label: '2' },
  { value: '3', label: '3 — скорее нет' },
  { value: '4', label: '4' },
  { value: '5', label: '5 — полностью да' },
]

export const YN_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'yes', label: 'Да' },
  { value: 'no', label: 'Нет' },
]

/** Вопросы гайда в порядке следования (секции → вопросы). */
export function guideOrderedQuestions(guide: GuideDto): GuideQuestionDto[] {
  return guide.sections.flatMap((section) => section.questions)
}

export function guideStats(guide: GuideDto): { sections: number; questions: number } {
  return {
    sections: guide.sections.length,
    questions: guideOrderedQuestions(guide).length,
  }
}

/** Ответы из DTO в плоскую карту (последнее значение побеждает). */
export function answersToDraft(answers: ReadonlyArray<InterviewAnswerDto>): AnswerDraft {
  const draft: AnswerDraft = {}
  for (const answer of answers) draft[answer.questionId] = answer.value
  return draft
}

/**
 * Выполнено ли условие показа вопроса. Нет условия или исходный вопрос удалён —
 * показываем безусловно (как qCondMet прототипа: удаление источника не блокирует опросник).
 */
export function questionConditionMet(
  question: GuideQuestionDto,
  ordered: ReadonlyArray<GuideQuestionDto>,
  draft: AnswerDraft,
): boolean {
  if (!question.showIfQuestionId || !question.showIfValue) return true
  const source = ordered.find((item) => item.id === question.showIfQuestionId)
  if (!source) return true
  return draft[source.id] === question.showIfValue
}

/** Виден ли вопрос при текущих черновых ответах. */
export function isQuestionVisible(
  question: GuideQuestionDto,
  guide: GuideDto,
  draft: AnswerDraft,
): boolean {
  return questionConditionMet(question, guideOrderedQuestions(guide), draft)
}

/**
 * Черновик без ответов на скрытые условные вопросы — «введённое в скрытом чистится»
 * (как bindGuideConditions прототипа). Цепочки раскрываются рекурсивно: скрывшийся
 * источник прячет и своих потомков.
 */
export function pruneHiddenAnswers(guide: GuideDto, draft: AnswerDraft): AnswerDraft {
  const ordered = guideOrderedQuestions(guide)
  const result: AnswerDraft = {}
  // Обходим в порядке опросника: исходники разбираются раньше потомков, поэтому условие
  // потомка смотрит на уже отфильтрованный ответ источника (скрытый источник прячет потомка).
  for (const question of ordered) {
    if (questionConditionMet(question, ordered, result)) {
      result[question.id] = draft[question.id]
    }
  }
  return result
}

/** Ответ «не отвечен»: пустая строка, null, пустой массив или undefined. */
export function isAnswerEmpty(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * Батч для PUT answers: только видимые и отвеченные вопросы. PUT — полная замена,
 * поэтому скрытые/пустые просто не попадают в тело (сервер вдобавок перепроверит условия).
 */
export function collectSaveableAnswers(
  guide: GuideDto,
  draft: AnswerDraft,
): InterviewAnswerDto[] {
  const pruned = pruneHiddenAnswers(guide, draft)
  const answers: InterviewAnswerDto[] = []
  for (const [questionId, value] of Object.entries(pruned)) {
    if (isAnswerEmpty(value)) continue
    answers.push({ questionId, value: value as AnswerValue })
  }
  return answers
}

/** Человекочитаемый ответ для режима просмотра (как fmtAnswer прототипа). */
export function formatAnswer(question: GuideQuestionDto, value: AnswerValue | undefined): string {
  if (isAnswerEmpty(value)) return '— не отвечено —'
  if (question.type === 'yn') return value === 'yes' ? 'Да' : 'Нет'
  if (question.type === 'multi' && Array.isArray(value)) return value.join(', ')
  return String(value)
}

// ============================================================
// Конструктор гайда: условие показа
// ============================================================

export type ConditionOption = { value: string; questionId: string; answerValue: string; label: string }

/**
 * Варианты условия показа для вопроса: предшествующие вопросы типов «Да / Нет» и
 * «Выбор одного» (как qCondFieldHTML прототипа). Для нового вопроса (null) — все
 * существующие вопросы; значение кодируется как `questionId\u0000answerValue`.
 */
export function conditionOptions(
  guide: GuideDto,
  questionId: string | null,
): ConditionOption[] {
  const ordered = guideOrderedQuestions(guide)
  const limitIndex = questionId ? ordered.findIndex((item) => item.id === questionId) : -1
  const options: ConditionOption[] = []
  for (const [index, source] of ordered.entries()) {
    if (limitIndex >= 0 && index >= limitIndex) break
    const text = source.text.length > 34 ? `${source.text.slice(0, 34)}…` : source.text
    if (source.type === 'yn') {
      for (const yn of YN_OPTIONS) {
        options.push({
          value: encodeCondition(source.id, yn.value),
          questionId: source.id,
          answerValue: yn.value,
          label: `если «${text}» = ${yn.label}`,
        })
      }
    } else if (source.type === 'choice') {
      for (const option of source.options) {
        options.push({
          value: encodeCondition(source.id, option),
          questionId: source.id,
          answerValue: option,
          label: `если «${text}» = ${option}`,
        })
      }
    }
  }
  return options
}

export const CONDITION_SEPARATOR = '\u0000'

export function encodeCondition(questionId: string, answerValue: string): string {
  return `${questionId}${CONDITION_SEPARATOR}${answerValue}`
}

export function decodeCondition(value: string): { questionId: string; answerValue: string } | null {
  const [questionId, answerValue] = value.split(CONDITION_SEPARATOR)
  if (!questionId || !answerValue) return null
  return { questionId, answerValue }
}

/** Чип условия в списке вопросов конструктора («если «…» = Да»). */
export function conditionLabel(
  guide: GuideDto,
  question: GuideQuestionDto,
): string | null {
  if (!question.showIfQuestionId || !question.showIfValue) return null
  const source = guideOrderedQuestions(guide).find((item) => item.id === question.showIfQuestionId)
  if (!source) return 'условие: исходный вопрос удалён'
  const text = source.text.length > 34 ? `${source.text.slice(0, 34)}…` : source.text
  const answer =
    source.type === 'yn'
      ? question.showIfValue === 'yes'
        ? 'Да'
        : 'Нет'
      : question.showIfValue
  return `если «${text}» = ${answer}`
}
