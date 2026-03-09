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
}

export async function searchByEmbedding(apiUrl: string, embedding: Float32Array): Promise<SearchResult[]> {
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
    const errorData = (await response.json()) as SearchError
    throw new Error(`Search failed: ${errorData.error || `HTTP ${response.status}`}`)
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
    const errorData = (await response.json()) as SearchError
    throw new Error(`Search failed: ${errorData.error || `HTTP ${response.status}`}`)
  }

  return (await response.json()) as MultiIndexSearchResponse
}

