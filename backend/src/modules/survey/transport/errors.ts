import { AppError } from '../../../http/errors'
import { StorageError } from '../../../storage'
import { SurveyFailure } from '../domain/errors'

/**
 * Каждая ошибка — статус и код, на которые клиент может реагировать. Загрузочные failures
 * (expired/not_completed/rejected) держим отдельно от генерического CONFLICT, как у аватаров.
 */
export function toSurveyAppError(error: unknown) {
  // Хранилище может отвергнуть запрос, который пропустил контракт (например,
  // PRIVATE_STORAGE_UPLOAD_MAX_BYTES ниже лимита контракта) — это ошибка клиента, не 500.
  if (error instanceof StorageError && error.kind === 'invalid_request') {
    return new AppError(400, 'VALIDATION_ERROR', error.message, error.details)
  }

  if (!(error instanceof SurveyFailure)) return error

  if (error.kind === 'invalid') {
    return new AppError(400, 'VALIDATION_ERROR', error.message)
  }
  if (error.kind === 'forbidden') {
    return new AppError(403, 'FORBIDDEN', error.message)
  }
  if (error.kind === 'not_found') {
    return new AppError(404, 'NOT_FOUND', error.message)
  }
  if (error.kind === 'expired') {
    return new AppError(410, 'UPLOAD_EXPIRED', error.message)
  }
  if (error.kind === 'not_completed') {
    return new AppError(409, 'UPLOAD_NOT_COMPLETED', error.message)
  }
  if (error.kind === 'rejected') {
    return new AppError(409, 'UPLOAD_REJECTED', error.message)
  }
  return new AppError(409, 'CONFLICT', error.message)
}

export async function executeSurvey<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toSurveyAppError(error)
  }
}
