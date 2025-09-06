export async function searchByEmbedding(apiUrl: string, vector: Float32Array): Promise<string[]> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector: Array.from(vector) }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error ${response.status}: ${text}`)
  }
  const data = (await response.json()) as { urls: string[] }
  return data.urls
}

