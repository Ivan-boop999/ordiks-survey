export type ReportingFailureKind = 'invalid' | 'forbidden' | 'not_found' | 'conflict'

export class ReportingFailure extends Error {
  constructor(
    public readonly kind: ReportingFailureKind,
    message: string,
  ) {
    super(message)
    this.name = 'ReportingFailure'
  }
}
