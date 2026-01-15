export type FeedbackRequestBody = {
  audioQuery?: string
  audioId?: string
  freesound_urls: (string | null)[]
  ratings: ('like' | 'dislike' | null)[]
}

export type FeedbackResponse = {
  message: string
  audioId: string
  audioUrl: string
  metadataUrl: string
}

async function readJsonSafely(res: Response): Promise<any> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { _nonJsonBody: text }
  }
}

export async function submitFeedback(feedbackUrl: string, body: FeedbackRequestBody): Promise<FeedbackResponse> {
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    return (await window.electronAPI.submitFeedback(body)) as FeedbackResponse
  }

  const res = await fetch(feedbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await readJsonSafely(res)

  if (!res.ok) {
    const msg =
      data?.error ||
      data?._nonJsonBody ||
      `HTTP ${res.status} (${res.statusText})`
    throw new Error(`Feedback failed @ ${res.url}: ${msg}`)
  }

  return data as FeedbackResponse
}