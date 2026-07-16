import { getToken, invalidateToken } from './auth'

const BASE = 'https://www.googleapis.com/calendar/v3'

export class ApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
    message: string,
  ) {
    super(message)
  }
  get isRetryable(): boolean {
    return (
      this.status === 429 ||
      this.status >= 500 ||
      (this.status === 403 && (this.reason === 'rateLimitExceeded' || this.reason === 'userRateLimitExceeded'))
    )
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  ifMatch?: string
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  return apiAttempt(path, opts, true)
}

async function apiAttempt<T>(path: string, opts: ApiOptions, retryAuth: boolean): Promise<T> {
  const token = await getToken(false)
  const url = new URL(BASE + path)
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.ifMatch) headers['If-Match'] = opts.ifMatch

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  if (res.status === 401 && retryAuth) {
    await invalidateToken(token)
    return apiAttempt(path, opts, false)
  }
  if (!res.ok) {
    let reason = ''
    let message = `${res.status} ${res.statusText}`
    try {
      const err = (await res.json()) as {
        error?: { message?: string; errors?: { reason?: string }[] }
      }
      reason = err.error?.errors?.[0]?.reason ?? ''
      if (err.error?.message) message = `${res.status} ${err.error.message}`
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, reason, message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
