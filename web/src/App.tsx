import { useEffect, useState } from 'react'
import './App.css'
import Recorder from './components/Recorder'
import Results from './components/Results'
import type { Recording } from './lib/audio/recorder'
import { audioBlobToMonoFloat32, loadSession, runEmbedding } from './lib/model/embedding'

function App() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [results, setResults] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [session, setSession] = useState<any>(null)
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined
  const modelUrl = import.meta.env.VITE_MODEL_URL as string | undefined

  useEffect(() => {
    let mounted = true
    if (modelUrl) {
      loadSession(modelUrl)
        .then((s) => mounted && setSession(s))
        .catch((e) => setError(`Failed to load model: ${String(e)}`))
    }
    return () => {
      mounted = false
    }
  }, [modelUrl])

  const onRecorded = async (rec: Recording) => {
    setError(null)
    setResults([])
    setAudioUrl(rec.url)
  }

  const onSearch = async () => {
    if (!session || !apiUrl || !audioUrl) return
    try {
      setLoading(true)
      const mono = await audioBlobToMonoFloat32(await (await fetch(audioUrl)).blob())
      const { vector } = await runEmbedding(session, mono, 48000)
      const res = await (await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vector: Array.from(vector) }) })).json()
      setResults(res.urls || [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">ImiTune</h1>
          <p className="text-slate-600">Search Freesound by humming, beatboxing, or imitating.</p>
        </header>

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Record up to 10 seconds</h2>
              <p className="text-sm text-slate-600">We run the embedding model in your browser.</p>
            </div>
            <div className="flex gap-3">
              <Recorder onRecorded={onRecorded} />
              <button className="rounded-lg border px-4 py-2 hover:bg-slate-50" disabled={!audioUrl} onClick={() => { setAudioUrl(null); setResults([]); setError(null) }}>
                Clear
              </button>
            </div>
          </div>

          {audioUrl && (
            <audio className="mt-4 w-full" controls src={audioUrl} />
          )}
        </section>

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Top matches</h2>
              <p className="text-sm text-slate-600">Results come from Pinecone via the API.</p>
            </div>
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50" disabled={loading || !audioUrl || !session || !apiUrl} onClick={onSearch}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-4">
            <Results urls={results} />
          </div>
        </section>

        <footer className="text-center text-xs text-slate-500">Made with ❤️, runs fully client-side for embedding.</footer>
      </div>
    </div>
  )
}

export default App
