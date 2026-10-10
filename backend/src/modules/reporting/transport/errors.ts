import { AppError } from '../../../http/errors'
import { ProjectsFailure } from '../../projects'
import { ReportingFailure } from '../domain/errors'

/** Те же коды, что у projects/survey/processes: guard отказывает ProjectsFailure. */
export function toReportingAppError(error: unknown) {
  if (error instanceof ProjectsFailure) {
    if (error.kind === 'invalid') return new AppError(400, 'VALIDATION_ERROR', error.message)
    if (error.kind === 'forbidden') return new AppError(403, 'FORBIDDEN', error.message)
    if (error.kind === 'not_found') return new AppError(404, 'NOT_FOUND', error.message)
    return new AppError(409, 'CONFLICT', error.message)
  }

  if (!(error instanceof ReportingFailure)) return error

  if (error.kind === 'invalid') return new AppError(400, 'VALIDATION_ERROR', error.message)
  if (error.kind === 'forbidden') return new AppError(403, 'FORBIDDEN', error.message)
  if (error.kind === 'not_found') return new AppError(404, 'NOT_FOUND', error.message)
  return new AppError(409, 'CONFLICT', error.message)
}

export async function executeReporting<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toReportingAppError(error)
  }
}
