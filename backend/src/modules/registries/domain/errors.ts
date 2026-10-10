export type RegistriesFailureKind = 'invalid' | 'forbidden' | 'not_found' | 'conflict'

export class RegistriesFailure extends Error {
  constructor(
    public readonly kind: RegistriesFailureKind,
    message: string,
  ) {
    super(message)
    this.name = 'RegistriesFailure'
  }
}
