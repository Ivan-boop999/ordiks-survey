import { AppError } from '../../../http/errors'
import { InvitesFailure } from '../domain/errors'

export function toInvitesAppError(error: unknown) {
  if (!(error instanceof InvitesFailure)) return error

  if (error.kind === 'invalid') {
    return new AppError(400, 'INVITE_INVALID', error.message)
  }
  if (error.kind === 'forbidden') {
    return new AppError(403, 'FORBIDDEN', error.message)
  }
  if (error.kind === 'not_found') {
    return new AppError(404, 'NOT_FOUND', error.message)
  }
  return new AppError(409, 'CONFLICT', error.message)
}

export async function executeInvites<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toInvitesAppError(error)
  }
}
