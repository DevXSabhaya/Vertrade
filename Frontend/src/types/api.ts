/** Exact shape of GlobalExceptionFilter's response body (backend `src/common/filters/global-exception.filter.ts`). */
export interface ApiErrorBody {
  readonly statusCode: number
  readonly timestamp: string
  readonly path: string
  readonly message: string | string[]
  readonly code?: string
  readonly correlationId?: string
}

/** Thrown by the API client for every non-2xx response — the one type every caller needs to handle. */
export class ApiError extends Error {
  readonly statusCode: number
  readonly code?: string
  readonly correlationId?: string

  constructor(body: ApiErrorBody) {
    super(Array.isArray(body.message) ? body.message.join(', ') : body.message)
    this.name = 'ApiError'
    this.statusCode = body.statusCode
    this.code = body.code
    this.correlationId = body.correlationId
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401
  }

  get isValidationError(): boolean {
    return this.statusCode === 400
  }
}
