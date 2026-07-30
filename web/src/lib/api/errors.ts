export class RateLimitError extends Error {
  readonly status = 429
  readonly retryAfterSeconds?: number

  constructor(message: string, retryAfter?: unknown) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterSeconds = parseRetryAfterSeconds(retryAfter)
  }
}

export function parseRetryAfterSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.ceil(value))
  }
  if (typeof value !== 'string' || value.trim() === '') return undefined

  const seconds = Number(value)
  if (!Number.isFinite(seconds)) return undefined
  return Math.max(1, Math.ceil(seconds))
}
