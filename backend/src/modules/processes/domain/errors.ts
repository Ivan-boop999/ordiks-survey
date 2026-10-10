export type ProcessesFailureKind =
  | 'invalid'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  /// Окно тикета загрузки схемы закрылось.
  | 'expired'
  /// Байты по ключу ещё нет: браузер не докачал PUT.
  | 'not_completed'
  /// По ключу лежит не то, что было объявлено.
  | 'rejected'

export class ProcessesFailure extends Error {
  constructor(
    public readonly kind: ProcessesFailureKind,
    message: string,
  ) {
    super(message)
    this.name = 'ProcessesFailure'
  }
}
