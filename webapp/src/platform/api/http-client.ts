import { apiErrorSchema } from '@ordiks-survey/contracts'
import type { z } from 'zod'

const defaultApiBaseUrl = (import.meta.env?.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/**
 * Дефолтный таймаут любого API-запроса: зависший fetch больше не блокирует интерфейс
 * бесконечно (мутации авторизации имеют свой, более короткий таймаут в auth/api.ts).
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

function withDefaultTimeout(signal: AbortSignal | undefined): AbortSignal | undefined {
  const timeout = AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)
  if (!signal) return timeout
  // AbortSignal.any есть во всех актуальных браузерах; на старых — только abort вызывающего.
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout])
  return signal
}

export type HttpRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: HeadersInit
  credentials?: RequestCredentials
  /**
   * An abort the transport observes rejects the request with the signal's reason (an
   * `AbortError`) rather than an `ApiRequestError`, so callers cannot mistake a cancelled request
   * for one the backend answered. TanStack Query hands every fetch its own signal; forwarding it
   * lets a superseded query cancel its request instead of leaving it in flight.
   */
  signal?: AbortSignal
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export class HttpClient {
  private readonly baseUrl: string

  constructor(baseUrl = defaultApiBaseUrl) {
    this.baseUrl = baseUrl
  }

  async request<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: HttpRequestOptions = {},
  ): Promise<z.infer<TSchema>> {
    const response = await this.raw(path, options)
    // DELETE-эндпоинты отвечают 204 с пустым телом; `json()` на нём падает, поэтому пустой
    // текст разбирается как undefined и валидируется схемой (z.void()/optional).
    const text = await response.text()
    return schema.parse(text ? (JSON.parse(text) as unknown) : undefined)
  }

  async raw(path: string, options: HttpRequestOptions = {}): Promise<Response> {
    const headers = new Headers(options.headers)
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      credentials: options.credentials ?? 'include',
      headers,
      signal: withDefaultTimeout(options.signal),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    if (!response.ok) {
      throw await toApiError(response, options.signal)
    }

    return response
  }
}

async function toApiError(response: Response, signal?: AbortSignal) {
  const fallbackMessage = `Request failed with status ${response.status}`

  try {
    const parsed = apiErrorSchema.parse(await response.json())
    return new ApiRequestError(response.status, parsed.error.code, parsed.error.message)
  } catch {
    // An abort that lands while the error body is still streaming rejects `json()` with the abort
    // reason. Surface that reason instead of a status-coded error a caller could act on, such as
    // treating a cancelled 401 as an expired session.
    signal?.throwIfAborted()
    return new ApiRequestError(response.status, 'INTERNAL_ERROR', fallbackMessage)
  }
}
