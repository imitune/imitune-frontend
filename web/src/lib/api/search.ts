import { desktopSearch, isDesktopApp } from '../desktop/runtime'
import { RateLimitError } from './errors'

export type SearchResult = {
  id: string
  score: number
  freesound_url: string
}

export type MultiIndexSearchRow = {
  indexId: string
  indexLabel: string
  results: SearchResult[]
  error?: string | null
}

export type SearchResponse = {
  results: SearchResult[]
}

export type MultiIndexSearchResponse = {
  mode: 'multi-index'
  rows: MultiIndexSearchRow[]
}

export type SearchError = {
  error: string
  retryAfter?: number
}

export async function searchByEmbedding(apiUrl: string | undefined, embedding: Float32Array): Promise<SearchResult[]> {
  if (isDesktopApp()) {
    const response = await desktopSearch(Array.from(embedding)) as DesktopApiResponse<SearchResponse & SearchError>
    if (!response.ok) {
      const message = response.data?.error || response.statusText || 'Search failed'
      if (response.status === 429) {
        throw new RateLimitError(
          message,
          response.data?.retryAfter ?? response.rateLimit.retryAfter,
        )
      }
      const status = response.status > 0 ? ` (HTTP ${response.status})` : ''
      throw new Error(`${message}${status}`)
    }
    return response.data?.results ?? []
  }

  if (!apiUrl) throw new Error('Search API URL is not configured.')

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      embedding: Array.from(embedding) 
    }),
  })
  
  if (!response.ok) {
    let err = 'Search failed'
    let retryAfter: unknown = response.headers.get('Retry-After')
    try {
      const errorData = (await response.json()) as SearchError
      if (errorData?.error) err = errorData.error
      retryAfter = errorData?.retryAfter ?? retryAfter
    } catch {
      // JSON parsing failed, use fallback
    }
    if (response.status === 429) {
      throw new RateLimitError(err, retryAfter)
    }
    throw new Error(`${err} (HTTP ${response.status})`)
  }
  
  const data = (await response.json()) as SearchResponse
  return data.results
}

export async function searchAcrossIndexes(
  apiUrl: string,
  embedding: Float32Array,
  indexes?: string[],
): Promise<MultiIndexSearchResponse> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      embedding: Array.from(embedding),
      mode: 'dev',
      ...(indexes?.length ? { indexes } : {}),
    }),
  })

  if (!response.ok) {
    let err = 'Multi-index search failed'
    let retryAfter: unknown = response.headers.get('Retry-After')
    try {
      const errorData = (await response.json()) as SearchError
      if (errorData?.error) err = errorData.error
      retryAfter = errorData?.retryAfter ?? retryAfter
    } catch {
      // JSON parsing failed, use fallback
    }
    if (response.status === 429) {
      throw new RateLimitError(err, retryAfter)
    }
    throw new Error(`${err} (HTTP ${response.status})`)
  }

  return (await response.json()) as MultiIndexSearchResponse
}
