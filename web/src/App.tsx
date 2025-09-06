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
    <>
      {/* Static background gradient */}
      <div className="static-bg" aria-hidden="true" />
      <div className="relative min-h-screen text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">ImiTune</h1>
          <p className="text-slate-600">Search for sounds by imitating what's on your mind..</p>
        </header>

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">What sound is on your mind?</h2>
            <p className="text-sm text-slate-600">Imitate the sound you're looking for 🎤</p>
          </div>
          <div className="space-y-3">
            <Recorder onRecorded={onRecorded} />
          </div>

          {/* Audio preview handled by the in-box player; no native audio element */}
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

      </div>
      </div>
    </>
  )
}

export default App
