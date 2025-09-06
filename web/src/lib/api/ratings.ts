// Feedback API types (per backend spec)
export type FeedbackRequestBody = {
  audioQuery: string // data URL: data:audio/webm;base64,<...>
  freesound_urls: (string | null)[] // length 3
  ratings: ("like" | "dislike" | null)[] // length 3
}

export type FeedbackResponse = {
  message: string
  audioId: string
  audioUrl: string
  metadataUrl: string
}

export async function submitFeedback(feedbackUrl: string, body: FeedbackRequestBody): Promise<FeedbackResponse> {
  const res = await fetch(feedbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    let err = 'Feedback submit failed'
    try {
      const data = await res.json()
      if (data?.error) err = data.error
    } catch {}
    throw new Error(err + ` (HTTP ${res.status})`)
  }
  return (await res.json()) as FeedbackResponse
}
