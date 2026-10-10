export type InvitesFailureKind = 'invalid' | 'forbidden' | 'not_found' | 'conflict'

export class InvitesFailure extends Error {
  constructor(
    public readonly kind: InvitesFailureKind,
    message: string,
  ) {
    super(message)
  }
}
