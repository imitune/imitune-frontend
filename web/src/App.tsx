import { useEffect, useState } from 'react'
import './App.css'
import Recorder from './components/Recorder'
import Results from './components/Results'
import { searchByEmbedding, type SearchResult } from './lib/api/search'
import type { Recording } from './lib/audio/recorder'
import { audioBlobToMonoFloat32, loadSession, runEmbedding } from './lib/model/embedding'

function App() {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [embedding, setEmbedding] = useState<Float32Array | null>(null)
  const [processingEmbedding, setProcessingEmbedding] = useState(false)
  const [hasRecorded, setHasRecorded] = useState(false)
  const [hasValidAudio, setHasValidAudio] = useState(false)

  const [session, setSession] = useState<any>(null)
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined
  const modelUrl = import.meta.env.VITE_MODEL_URL as string | undefined

  useEffect(() => {
    let mounted = true
    console.log('Model URL:', modelUrl)
    if (modelUrl) {
      console.log('Testing model URL accessibility...')
      // First test if the model URL is accessible
      fetch(modelUrl, { method: 'HEAD' })
        .then(response => {
          console.log('Model URL test response:', response.status, response.headers.get('content-type'))
          if (!response.ok) {
            throw new Error(`Model not accessible: ${response.status}`)
          }
          console.log('Model URL accessible, loading session...')
          return loadSession(modelUrl)
        })
        .then((s) => {
          if (mounted) {
            console.log('Session loaded successfully:', s)
            setSession(s)
          }
        })
        .catch((e) => {
          console.error('Failed to load session:', e)
          setError(`Failed to load model: ${String(e)}`)
        })
    } else {
      console.log('No model URL provided')
    }
    return () => {
      mounted = false
    }
  }, [modelUrl])

  const onRecorded = async (rec: Recording) => {
    console.log('onRecorded called with:', rec)
    setError(null)
    setResults([])
    setEmbedding(null)
    setHasRecorded(true) // Mark that user has recorded
    setHasValidAudio(false) // Reset audio validation
    
    // Process embedding immediately after recording
    if (session) {
      console.log('Session available, processing embedding...')
      try {
        setProcessingEmbedding(true)
        console.log('Converting audio blob to mono float32...')
        const mono = await audioBlobToMonoFloat32(rec.blob, 32000) // Downsample to 32kHz
        console.log('Audio converted, mono length:', mono.length)
        
        // Check if audio has meaningful content
        const threshold = 0.01
        let hasContent = false
        for (let i = 0; i < mono.length; i++) {
          if (Math.abs(mono[i]) > threshold) {
            hasContent = true
            break
          }
        }
        
        if (!hasContent) {
          console.log('Audio appears to be empty/silent')
          setError('Recording appears to be empty or too quiet. Please try recording again.')
          return
        }
        
        console.log('Audio has content, running embedding with 32kHz sample rate')
        const { vector } = await runEmbedding(session, mono)
        setEmbedding(vector)
        setHasValidAudio(true) // Mark audio as valid
        console.log('Embedding extracted:', {
          length: vector.length,
          first5: Array.from(vector.slice(0, 5)),
          stats: {
            min: Math.min(...vector),
            max: Math.max(...vector),
            mean: vector.reduce((a, b) => a + b, 0) / vector.length
          }
        })
      } catch (e) {
        console.error('Error processing embedding:', e)
        setError(`Failed to process embedding: ${String(e)}`)
      } finally {
        setProcessingEmbedding(false)
      }
    } else {
      console.log('No session available, skipping embedding processing')
    }
  }

  const onSearch = async () => {
    if (!embedding || !apiUrl) return
    try {
      setLoading(true)
      const urls = await searchByEmbedding(apiUrl, embedding)
      setResults(urls)
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
      <div className="mx-auto max-w-5xl px-4 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Imitune</h1>
            <p className="text-slate-600">
              <span style={{ fontFamily: 'cursive' }}>*Magically*</span> search for sounds with your voice 💭
            </p>
        </header>

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">What sound is on your mind?</h2>
            <p className="text-sm text-slate-600">Imitate the sound you're looking for 🎤</p>
            {processingEmbedding && (
              <p className="text-sm text-blue-600 mt-1">Processing embedding...</p>
            )}
          </div>
          <Recorder 
            onRecorded={onRecorded}
            showRedGlow={!hasRecorded}
            extraButton={
              <button className={`glow-on-hover rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50 ${embedding && hasValidAudio && !loading && !processingEmbedding && results.length === 0 ? 'glow-active' : ''}`} disabled={loading || !embedding || !hasValidAudio || !apiUrl || processingEmbedding} onClick={onSearch}>
                {loading ? 'Searching…' : processingEmbedding ? 'Processing…' : 'Search ✨'}
              </button>
            }
          />

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {/* Audio preview handled by the in-box player; no native audio element */}
        </section>

        {results.length > 0 && (
          <section className="results-enter mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Matched sounds ✧♪</h2>
            </div>

            <div className="mt-4">
              <Results results={results} />
            </div>
          </section>
        )}

      </div>
      </div>
    </>
  )
}

export default App
