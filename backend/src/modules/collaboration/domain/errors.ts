export type CollaborationFailureKind = 'invalid' | 'forbidden' | 'not_found' | 'conflict'

export class CollaborationFailure extends Error {
  constructor(
    public readonly kind: CollaborationFailureKind,
    message: string,
  ) {
    super(message)
    this.name = 'CollaborationFailure'
  }
}
