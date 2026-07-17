/// <reference types="vite/client" />

declare global {
  type DesktopRateLimitHeaders = {
    limit: string | null
    remaining: string | null
    reset: string | null
    retryAfter: string | null
  }

  type DesktopApiResponse<T = unknown> = {
    ok: boolean
    status: number
    statusText: string
    data: T
    rateLimit: DesktopRateLimitHeaders
  }

  interface Window {
    __TAURI_INTERNALS__?: unknown
    webkitAudioContext?: typeof AudioContext
  }
}

export {}
