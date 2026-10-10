export type SurveyFailureKind =
  | 'invalid'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  /// Окно тикета загрузки файла факта закрылось.
  | 'expired'
  /// Байты по ключу ещё нет: браузер не докачал PUT.
  | 'not_completed'
  /// По ключу лежит не то, что было объявлено.
  | 'rejected'

export class SurveyFailure extends Error {
  constructor(
    public readonly kind: SurveyFailureKind,
    message: string,
  ) {
    super(message)
    this.name = 'SurveyFailure'
  }
}
