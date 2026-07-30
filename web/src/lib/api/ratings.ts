import { desktopSubmitFeedback, isDesktopApp } from '../desktop/runtime'
import { RateLimitError } from './errors'

export type RatingValue = -1 | 0 | 1

export type FeedbackResultContext = {
  route: 'default' | 'dev'
  indexId?: string
  indexLabel?: string
  rank: number
  freesound_url?: string
}

export type RatingSubmission = {
  urls: string[]
  ratings: RatingValue[]
  resultContexts?: (FeedbackResultContext | null)[]
}

// Feedback API types (per backend spec)
export type FeedbackRequestBody = {
  audioQuery?: string // data URL: data:audio/webm;base64,<...> (required for first submission)
  audioId?: string // reference to existing audio (for updates)
  freesound_urls: (string | null)[] // length 3
  ratings: ("like" | "dislike" | null)[] // length 3
  result_contexts?: (FeedbackResultContext | null)[]
}

export type FeedbackResponse = {
  message: string
  audioId: string
  audioUrl: string
  metadataUrl: string
}

export async function submitFeedback(feedbackUrl: string | undefined, body: FeedbackRequestBody): Promise<FeedbackResponse> {
  if (isDesktopApp()) {
    const response = await desktopSubmitFeedback(body) as DesktopApiResponse<FeedbackResponse & {
      error?: string
      retryAfter?: number
    }>
    if (!response.ok) {
      const message = response.data?.error || response.statusText || 'Feedback submit failed'
      if (response.status === 429) {
        throw new RateLimitError(
          message,
          response.data?.retryAfter ?? response.rateLimit.retryAfter,
        )
      }
      const status = response.status > 0 ? ` (HTTP ${response.status})` : ''
      throw new Error(`${message}${status}`)
    }
    return response.data
  }

  if (!feedbackUrl) throw new Error('Feedback API URL is not configured.')

  const res = await fetch(feedbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    let err = 'Feedback submit failed'
    let retryAfter: unknown = res.headers.get('Retry-After')
    try {
      const data = await res.json()
      if (data?.error) err = data.error
      retryAfter = data?.retryAfter ?? retryAfter
    } catch {
      // Keep the generic message when the response is not JSON.
    }
    if (res.status === 429) {
      throw new RateLimitError(err, retryAfter)
    }
    throw new Error(err + ` (HTTP ${res.status})`)
  }
  return (await res.json()) as FeedbackResponse
}
