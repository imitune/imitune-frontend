export type SearchResult = {
  id: string
  score: number
  freesound_url: string
}

export type SearchResponse = {
  results: SearchResult[]
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

