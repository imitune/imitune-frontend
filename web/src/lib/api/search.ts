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
  console.log('Searching with embedding of length:', embedding.length)
  console.log('API URL:', apiUrl)
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      embedding: Array.from(embedding) 
    }),
  })
  
  console.log('Search response status:', response.status)
  
  if (!response.ok) {
    const errorData = (await response.json()) as SearchError
    console.error('Search API error:', errorData)
    throw new Error(`Search failed: ${errorData.error || `HTTP ${response.status}`}`)
  }
  
  const data = (await response.json()) as SearchResponse
  console.log('Search results:', data.results.length, 'matches found')
  console.log('Top result:', data.results[0])
  
  return data.results
}

