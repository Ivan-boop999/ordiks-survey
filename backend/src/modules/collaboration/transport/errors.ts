import { AppError } from '../../../http/errors'
import { ProjectsFailure } from '../../projects'
import { CollaborationFailure } from '../domain/errors'

/** Те же коды, что у остальных модулей обследования: guard отказывает ProjectsFailure. */
export function toCollaborationAppError(error: unknown) {
  if (error instanceof ProjectsFailure) {
    if (error.kind === 'invalid') return new AppError(400, 'VALIDATION_ERROR', error.message)
    if (error.kind === 'forbidden') return new AppError(403, 'FORBIDDEN', error.message)
    if (error.kind === 'not_found') return new AppError(404, 'NOT_FOUND', error.message)
    return new AppError(409, 'CONFLICT', error.message)
  }

  if (!(error instanceof CollaborationFailure)) return error

  if (error.kind === 'invalid') return new AppError(400, 'VALIDATION_ERROR', error.message)
  if (error.kind === 'forbidden') return new AppError(403, 'FORBIDDEN', error.message)
  if (error.kind === 'not_found') return new AppError(404, 'NOT_FOUND', error.message)
  return new AppError(409, 'CONFLICT', error.message)
}

export async function executeCollaboration<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toCollaborationAppError(error)
  }
}
