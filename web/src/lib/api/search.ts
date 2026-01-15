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

async function readJsonSafely(res: Response): Promise<any> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { _nonJsonBody: text }
  }
}

export async function searchByEmbedding(apiUrl: string, embedding: Float32Array): Promise<SearchResult[]> {
  // Electron: main-process fetch via IPC
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    const data = (await window.electronAPI.search(Array.from(embedding))) as SearchResponse
    return data.results
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embedding: Array.from(embedding) }),
  })

  const data = await readJsonSafely(response)

  if (!response.ok) {
    const msg =
      data?.error ||
      data?._nonJsonBody ||
      `HTTP ${response.status} (${response.statusText})`
    throw new Error(`Search failed @ ${response.url}: ${msg}`)
  }

  return (data as SearchResponse).results ?? []
}