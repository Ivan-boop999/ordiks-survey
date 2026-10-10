import { AppError } from '../../../http/errors'
import { StorageError } from '../../../storage'
import { ProjectsFailure } from '../../projects'
import { ProcessesFailure } from '../domain/errors'

/**
 * Маппинг failures на статусы, те же коды, что у survey: guard проектов — ProjectsFailure,
 * загрузка схем (expired/not_completed/rejected) — отдельные коды, как у аватаров и фактов.
 */
export function toProcessesAppError(error: unknown) {
  if (error instanceof StorageError && error.kind === 'invalid_request') {
    return new AppError(400, 'VALIDATION_ERROR', error.message, error.details)
  }

  if (error instanceof ProjectsFailure) {
    if (error.kind === 'invalid') return new AppError(400, 'VALIDATION_ERROR', error.message)
    if (error.kind === 'forbidden') return new AppError(403, 'FORBIDDEN', error.message)
    if (error.kind === 'not_found') return new AppError(404, 'NOT_FOUND', error.message)
    return new AppError(409, 'CONFLICT', error.message)
  }

  if (!(error instanceof ProcessesFailure)) return error

  if (error.kind === 'invalid') return new AppError(400, 'VALIDATION_ERROR', error.message)
  if (error.kind === 'forbidden') return new AppError(403, 'FORBIDDEN', error.message)
  if (error.kind === 'not_found') return new AppError(404, 'NOT_FOUND', error.message)
  if (error.kind === 'expired') return new AppError(410, 'UPLOAD_EXPIRED', error.message)
  if (error.kind === 'not_completed') return new AppError(409, 'UPLOAD_NOT_COMPLETED', error.message)
  if (error.kind === 'rejected') return new AppError(409, 'UPLOAD_REJECTED', error.message)
  return new AppError(409, 'CONFLICT', error.message)
}

export async function executeProcesses<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toProcessesAppError(error)
  }
}
