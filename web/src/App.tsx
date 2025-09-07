import { useEffect, useState } from 'react'
import './App.css'
import Recorder from './components/Recorder'
import Results from './components/Results'
import { submitFeedback } from './lib/api/ratings'
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
  const [lastRecordingBlob, setLastRecordingBlob] = useState<Blob | null>(null)
  const [submittingRatings, setSubmittingRatings] = useState(false)
  const [ratingsSubmitted, setRatingsSubmitted] = useState(false)
  const [hasConsent, setHasConsent] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [pendingRatingsData, setPendingRatingsData] = useState<{ urls: string[]; ratings: (-1 | 0 | 1)[] } | null>(null)

  const [session, setSession] = useState<any>(null)
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined
  const modelUrl = import.meta.env.VITE_MODEL_URL as string | undefined

  useEffect(() => {
    let mounted = true
    // Load stored consent
    try {
      const stored = localStorage.getItem('imitune_feedback_consent_v1')
      if (stored === 'true') setHasConsent(true)
    } catch {}
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
    setRatingsSubmitted(false)
  setLastRecordingBlob(rec.blob)
    
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
  setRatingsSubmitted(false) // allow new rating round for fresh results
  setResults(urls)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitRatings = async (data: { urls: string[]; ratings: (-1 | 0 | 1)[] }) => {
    if (!apiUrl) return
    // Build feedback endpoint (explicit path provided by backend doc)
  const feedbackUrl = '/api/feedback'
    try {
      setSubmittingRatings(true)
      setError(null)
      // Convert audio blob to base64 data URL
      if (!lastRecordingBlob) throw new Error('No recorded audio available')
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(lastRecordingBlob)
      })
      // Map ratings to API spec (like/dislike/null)
      const mappedRatings = data.ratings.map(r => r === 1 ? 'like' : r === 0 ? 'dislike' : null) as ("like"|"dislike"|null)[]
      const freesoundUrls = data.urls.map(u => u || null)
      await submitFeedback(feedbackUrl, {
        audioQuery: audioBase64,
        freesound_urls: freesoundUrls,
        ratings: mappedRatings
      })
      setRatingsSubmitted(true)
    } catch (e:any) {
      setError(e.message || 'Failed to submit ratings')
    } finally {
      setSubmittingRatings(false)
    }
  }

  // Gatekeeper that checks consent before actually submitting
  const requestSubmitRatings = (data: { urls: string[]; ratings: (-1 | 0 | 1)[] }) => {
  if (hasConsent) {
      void handleSubmitRatings(data)
    } else {
      setPendingRatingsData(data)
      setShowConsent(true)
    }
  }

  const acceptConsentAndSubmit = () => {
    if (!pendingRatingsData) {
      setShowConsent(false)
      return
    }
    try {
      localStorage.setItem('imitune_feedback_consent_v1', 'true')
    } catch {}
    setHasConsent(true)
    setShowConsent(false)
    const data = pendingRatingsData
    setPendingRatingsData(null)
    void handleSubmitRatings(data)
  }

  const cancelConsent = () => {
    setShowConsent(false)
    setPendingRatingsData(null)
  }

  return (
    <>
      {/* Static background gradient */}
      <div className="static-bg" aria-hidden="true" />
      <div className="relative min-h-screen text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-5xl px-4 pt-10 pb-20">
        <header className="mb-8">
          {/* <h1 className="text-3xl font-bold tracking-tight">Imitune</h1> */}
          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-300">
        <span style={{ fontFamily: 'cursive' }}>*Magically*</span> search for sounds with your voice.
          </p>
        </header>

        <section className="mb-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <Recorder
            onRecorded={onRecorded}
            showRedGlow={!hasRecorded}
            centerContent={
              <>
                <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight">Simply imitate the sound you're looking for 🎙️</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-bold">Stuck?</span> Try <em>explosion</em> 💥, <em>crow</em> 🐦‍⬛, or <em>horn</em> 🚗
                </p>
                {/* Removed transient processing text to avoid layout shift */}
              </>
            }
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
          <section className="results-enter mb-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Matched sounds ✧♪</h2>
            </div>

            <div className="mt-4">
              <Results results={results} submitted={ratingsSubmitted} submitting={submittingRatings} onSubmitRatings={requestSubmitRatings} />
              {/* {ratingsSubmitted && <p className="mt-4 text-sm text-green-600">Thanks! Ratings submitted.</p>} */}
            </div>
          </section>
        )}

      </div>
      {/* Consent Modal */}
      {showConsent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={cancelConsent} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-lg">
            <h3 id="consent-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Share feedback?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              By submitting ratings, we will store an <b>anonymized</b> version of the recorded audio query. This is being done as part of our research project, which you can read more about here. The data might be shared for use in open research, such us for improving this sound search algorithm. The data will <b>not</b> be used for any commercial purposes. Do you agree to proceed?
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={cancelConsent} className="rounded-md px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600">Cancel</button>
              <button type="button" onClick={acceptConsentAndSubmit} className="rounded-md px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600">Agree & Submit</button>
            </div>
          </div>
        </div>
      )}
      {/* Data sharing toggle */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={() => {
            if (hasConsent) {
              // Turning off
              setHasConsent(false)
              try { localStorage.removeItem('imitune_feedback_consent_v1') } catch {}
            } else {
              // Turning on triggers modal for explicit acceptance
              setPendingRatingsData(null)
              setShowConsent(true)
            }
          }}
          className={`group flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium shadow-sm backdrop-blur bg-white/80 dark:bg-slate-800/70 border-slate-300 dark:border-slate-600 transition-colors ${hasConsent ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-300'}`}
          aria-pressed={hasConsent}
          aria-label="Toggle data sharing consent"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${hasConsent ? 'bg-green-500' : 'bg-slate-400 dark:bg-slate-500'}`} />
          {hasConsent ? 'Data sharing: ON' : 'Data sharing: OFF'}
        </button>
      </div>
      </div>
    </>
  )
}

export default App
