import { useEffect, useState } from 'react'
import './App.css'
import soundalikeLogo from './assets/soundalike.svg'
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
  const [hasValidAudio, setHasValidAudio] = useState(false)
  const [lastRecordingBlob, setLastRecordingBlob] = useState<Blob | null>(null)
  const [submittingRatings, setSubmittingRatings] = useState(false)
  const [ratingsSubmitted, setRatingsSubmitted] = useState(false)
  const [hasConsent, setHasConsent] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [pendingRatingsData, setPendingRatingsData] = useState<{ urls: string[]; ratings: (-1 | 0 | 1)[] } | null>(null)
  const [hasReadDocuments, setHasReadDocuments] = useState(false)
  const [hasAgreedToConsent, setHasAgreedToConsent] = useState(false)

  const [session, setSession] = useState<any>(null)
  // Environment variables (baked at build time). In GitHub Pages workflow you must provide them.
  const rawApiSearchUrl = import.meta.env.VITE_API_URL as string | undefined // full /api/search endpoint (legacy var)
  const explicitFeedbackUrl = import.meta.env.VITE_FEEDBACK_URL as string | undefined // optional explicit feedback endpoint
  const backendBase = import.meta.env.VITE_BACKEND_BASE as string | undefined // optional base like https://your-app.vercel.app
  const modelEnvUrl = import.meta.env.VITE_MODEL_URL as string | undefined

  // Derive search & feedback endpoints with sensible fallbacks so production (GitHub Pages) works without the dev proxy.
  const apiUrl = (() => {
    if (rawApiSearchUrl) return rawApiSearchUrl
    if (backendBase) return backendBase.replace(/\/$/, '') + '/api/search'
    return undefined
  })()

  const feedbackUrl = (() => {
    if (explicitFeedbackUrl) return explicitFeedbackUrl
    if (backendBase) return backendBase.replace(/\/$/, '') + '/api/feedback'
    if (rawApiSearchUrl) {
      // Try to replace /search with /feedback if pattern matches
      const m = rawApiSearchUrl.match(/\/api\/search\/?$/)
      if (m) return rawApiSearchUrl.replace(/\/api\/search\/?$/, '/api/feedback')
    }
    return undefined
  })()

  // Model URL fallback: use provided env var OR default to model in public folder respecting Vite base path.
  // Avoid using new URL() with a path-only base (can throw). import.meta.env.BASE_URL always ends with '/'.
  const modelUrl = modelEnvUrl || (import.meta.env.BASE_URL + 'model.onnx')

  useEffect(() => {
    let mounted = true
    // Load stored consent
    try {
      const stored = localStorage.getItem('imitune_feedback_consent_v1')
      if (stored === 'true') setHasConsent(true)
    } catch {}
    console.log('[Init] Derived endpoints:', { apiUrl, feedbackUrl, backendBase, rawApiSearchUrl, modelUrl })
    if (!apiUrl) {
      console.warn('Search API URL is undefined. Set VITE_API_URL or VITE_BACKEND_BASE.')
    }
    if (!feedbackUrl) {
      console.warn('Feedback API URL is undefined. Set VITE_FEEDBACK_URL, VITE_BACKEND_BASE, or VITE_API_URL ending in /api/search.')
    }
    console.log('Model URL (resolved):', modelUrl)
    console.log('Testing model URL accessibility...')
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
    return () => {
      mounted = false
    }
  }, [modelUrl, apiUrl, feedbackUrl, backendBase, rawApiSearchUrl])

  // Process embedding when session becomes available and we have valid audio but no embedding yet
  useEffect(() => {
    const processDelayedEmbedding = async () => {
      if (session && hasValidAudio && !embedding && lastRecordingBlob && !processingEmbedding) {
        console.log('Session now available, processing pending recording...')
        try {
          setProcessingEmbedding(true)
          const mono = await audioBlobToMonoFloat32(lastRecordingBlob, 32000)
          const { vector } = await runEmbedding(session, mono)
          setEmbedding(vector)
          console.log('Delayed embedding extracted:', {
            length: vector.length,
            first5: Array.from(vector.slice(0, 5)),
            stats: {
              min: Math.min(...vector),
              max: Math.max(...vector),
              mean: vector.reduce((a, b) => a + b, 0) / vector.length
            }
          })
        } catch (e) {
          console.error('Error processing delayed embedding:', e)
          setError(`Failed to process embedding: ${String(e)}`)
        } finally {
          setProcessingEmbedding(false)
        }
      }
    }
    void processDelayedEmbedding()
  }, [session, hasValidAudio, embedding, lastRecordingBlob, processingEmbedding])

  const onRecorded = async (rec: Recording) => {
    console.log('onRecorded called with:', rec)
    setError(null)
    setResults([])
    setEmbedding(null)
    setHasValidAudio(false) // Reset audio validation
    setRatingsSubmitted(false)
    setLastRecordingBlob(rec.blob)
    
    // Always validate audio content first, regardless of session state
    try {
      console.log('Validating audio content...')
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
      
      console.log('Audio has content, marked as valid')
      setHasValidAudio(true) // Mark audio as valid immediately after validation
      
      // Process embedding if session is available
      if (session) {
        console.log('Session available, processing embedding...')
        try {
          setProcessingEmbedding(true)
          console.log('Running embedding with 32kHz sample rate')
          const { vector } = await runEmbedding(session, mono)
          setEmbedding(vector)
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
        console.log('Session not yet available, will process embedding when session loads')
      }
    } catch (e) {
      console.error('Error validating audio:', e)
      setError(`Failed to process audio: ${String(e)}`)
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
    if (!feedbackUrl) {
      setError('Feedback endpoint not configured.')
      return
    }
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
    if (!hasReadDocuments || !hasAgreedToConsent) {
      return // Extra safety check
    }
    try {
      localStorage.setItem('imitune_feedback_consent_v1', 'true')
    } catch {}
    setHasConsent(true)
    setShowConsent(false)
    const data = pendingRatingsData
    setPendingRatingsData(null)
    setHasReadDocuments(false)
    setHasAgreedToConsent(false)
    void handleSubmitRatings(data)
  }

  const cancelConsent = () => {
    setShowConsent(false)
    setPendingRatingsData(null)
    setHasReadDocuments(false)
    setHasAgreedToConsent(false)
  }

  return (
    <>
      {/* Static background gradient */}
      <div className="static-bg" aria-hidden="true" />
      <div className="relative min-h-screen text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-5xl px-4 pt-10 pb-20">
  <header className="mb-8 flex flex-col items-center gap-4 text-center lg:flex-row lg:items-center lg:justify-between lg:text-left">
          <div 
            className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-4 cursor-pointer"
            onClick={() => window.location.reload()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                window.location.reload()
              }
            }}
          >
            <img src={soundalikeLogo} alt="soundalike logo" className="w-auto max-w-full" style={{ height: '56px' }} />
            <h1 className="text-4xl font-bold tracking-tight text-center sm:text-left" style={{ margin: 0 }}>
                <span className="text-slate-500 dark:text-slate-400" style={{ fontStyle: 'normal' }}>that</span>
              <span className="text-black dark:text-white" style={{ fontStyle: 'italic' }}>soundslike</span>
              <span className="text-slate-500 dark:text-slate-400" style={{ fontStyle: 'normal' }}>.me</span>
            </h1>
          </div>
  <div className="hidden lg:block text-xl text-black dark:text-slate-300 text-center lg:text-right">
                <span className="quintessential-regular" style={{ fontStyle: 'italic' }}>*Magically*  </span> search for sounds with your voice
            </div>
        </header>

        <section className="mb-5 rounded-xl border border-slate-900 dark:border-slate-900 p-6">
          <Recorder
            onRecorded={onRecorded}
            centerContent={
              <>
                <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight">Imitate the sound that's in your mind 🎙️</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-bold">Stuck?</span> Try <em>boooom</em> 💥, <em>kraa kraa</em> 🐦‍⬛, or <em>beep beep</em> 🚗
                </p>
                {/* Removed transient processing text to avoid layout shift */}
              </>
            }
            extraButton={
              <button className={`yellow-glow-action-button flex w-full items-center justify-center rounded-xl border border-slate-900 dark:border-slate-900 px-4 py-2 text-base font-medium text-black dark:text-white hover:opacity-90 disabled:opacity-50 md:w-auto ${embedding && hasValidAudio && !loading && !processingEmbedding && results.length === 0 ? 'glow-active' : ''}`} disabled={loading || !embedding || !hasValidAudio || !apiUrl || processingEmbedding} onClick={onSearch}>
                {loading ? 'Searching…' : processingEmbedding ? 'Processing…' : 'Search ✨'}
              </button>
            }
          />

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {/* Audio preview handled by the in-box player; no native audio element */}
        </section>

        {results.length > 0 && (
          <section className="results-enter mb-6 rounded-xl border border-slate-900 dark:border-slate-900 p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Matched sounds ✧♪</h2>
            </div>

            <div className="mt-4">
              <Results results={results} submitted={ratingsSubmitted} submitting={submittingRatings} onSubmitRatings={requestSubmitRatings} />
              {/* {ratingsSubmitted && <p className="mt-4 text-sm text-green-600">Thanks! Ratings submitted.</p>} */}
            </div>
          </section>
        )}

        {/* Credits Footer */}
        <footer className="mt-6 pt-8 border-t border-slate-200 dark:border-slate-700">
          <div className="flex flex-col items-center gap-8 text-center">
            {/* Team names */}
            <div>
              <p className="mb-3 text-xs font-medium tracking-wider text-slate-500 dark:text-slate-400">Made with love by</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <a href="https://chrispla.me" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline">
                  Christos Plachouras
                </a>
                {", "}
                <a href="https://uk.linkedin.com/in/adibh" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline">
                  Aditya Bhattacharjee
                </a>
                {", "}
                <a href="https://uk.linkedin.com/in/mimbres-101" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 hover:underline">
                  Sungkyun Chang
                </a>
              </p>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">and supported by</p>
            </div>

            {/* Logos */}
            <div className="flex items-center justify-center gap-8">
              <a href="https://www.qmul.ac.uk" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-75">
                <img 
                  src={`${import.meta.env.BASE_URL}qmul.png`} 
                  alt="Queen Mary University of London" 
                  className="h-12 w-auto object-contain"
                />
              </a>
              <a href="https://www.ukri.org" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-75">
                <img 
                  src={`${import.meta.env.BASE_URL}ukri.png`} 
                  alt="UKRI" 
                  className="h-12 w-auto object-contain"
                />
              </a>
            </div>

            {/* Copyright */}
            <p className="text-xs text-slate-500 dark:text-slate-500">© 2025 thatsoundslike.me. All rights reserved.</p>
          </div>
        </footer>

      </div>
      {/* Consent Modal */}
      {showConsent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={cancelConsent} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="relative z-10 w-full max-w-md rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-6 max-h-[90vh] overflow-y-auto">
        <h3 id="consent-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Research Study Consent</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 text-left">
          By default, all recordings and feedback you record exist exclusively on your device, not our servers.<br /><br />
          
          However, we are running a study to understand how to improve these models, which involves collecting anonymised user recordings and ratings. These would be used solely for <u>non-commercial</u> research purposes.<br /><br />

         <b>We would sincerely appreciate it if you choose to contribute to the study by enabling data sharing!</b> <br /><br /> Detailed information about the study can be found in the{" "}
          <a
            href={`${import.meta.env.BASE_URL}participant_information_sheet.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 dark:text-sky-400 underline hover:text-sky-700 dark:hover:text-sky-300"
          >
            Participant Information Sheet
          </a>{" "}
          and the{" "}
          <a
            href={`${import.meta.env.BASE_URL}consent_form.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 dark:text-sky-400 underline hover:text-sky-700 dark:hover:text-sky-300"
          >
            Consent Form
          </a>
          . More information about us and this project can be found{" "}
          <button
            type="button"
            onClick={() => {
          setShowConsent(false)
          setShowAbout(true)
            }}
            className="inline text-sky-600 dark:text-sky-400 underline hover:text-sky-700 dark:hover:text-sky-300"
          >
            here
          </button>
           - tl;dr we're students and researchers at Queen Mary University of London, and we've built this as a fun tool to help with open-source, non-commercial research!
        </p>

        <div className="mb-4 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <span className="text-sm text-slate-700 dark:text-slate-300 text-left flex-1">
          I confirm that I have read and understood both the Participant Information Sheet and the Consent Form.
            </span>
            <input
          type="checkbox"
          checked={hasReadDocuments}
          onChange={(e) => setHasReadDocuments(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
            />
          </label>
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <span className="text-sm text-slate-700 dark:text-slate-300 text-left flex-1">
          I agree to the terms outlined in the Consent Form and consent to participate in this research study.
            </span>
            <input
          type="checkbox"
          checked={hasAgreedToConsent}
          onChange={(e) => setHasAgreedToConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400"
            />
          </label>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={cancelConsent} className="rounded-md px-4 py-2 text-sm font-medium border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
          <button 
            type="button" 
            onClick={acceptConsentAndSubmit}
            disabled={!hasReadDocuments || !hasAgreedToConsent}
            className={`rounded-md px-4 py-2 text-sm font-medium border-2 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${hasReadDocuments && hasAgreedToConsent ? 'text-white' : 'border-slate-300 dark:border-slate-600 bg-transparent text-slate-600 dark:text-slate-400 cursor-not-allowed'}`}
            style={hasReadDocuments && hasAgreedToConsent ? { borderColor: 'rgb(143, 177, 120)', backgroundColor: 'rgb(143, 177, 120)' } : {}}
          >
            Agree & Submit
          </button>
        </div>
          </div>
        </div>
      )}
      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAbout(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-labelledby="about-title" className="relative z-10 w-full max-w-md rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-6">
        <h3 id="about-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">About this project</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          thatsoundslike.me is built and maintained by{" "}
          <a href="https://chrispla.me" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline">Christos Plachouras</a>,{" "}
          <a href="https://uk.linkedin.com/in/adibh" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline">Aditya Bhattacharjee</a>, and{" "}
          <a href="https://uk.linkedin.com/in/mimbres-101" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline">Sungkyun Chang</a>, researchers at Queen Mary University of London.<br /><br />
          After participating in a challenge to build machine learning models for matching vocal imitations with target sounds, we thought of making this website as a fun, non-commercial application of the technology, that could help people discover new sounds and contribute to improving the underlying models.<br /><br />
          We designed this website with privacy in mind: unless you specifically agree to take part in our study, your recording is processed and stored ONLY on your device, not our servers. This is possible by having developed a tiny model that can run entirely in your browser with ONNX.<br /><br />
          If you consent to data collection and submit likes or dislikes to returned sounds, you help us collect data to improve open-source, non-commercial query by vocal imitation models!
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          We hope you enjoy playing around with the website! For feedback or questions, email c dot plachouras at qmul dot ac dot uk.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={() => setShowAbout(false)} className="rounded-md px-4 py-2 text-sm font-medium border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800">Close</button>
        </div>
          </div>
        </div>
      )}
      {/* Bottom-right actions: About + Data sharing toggle */}
  <div className="fixed bottom-4 left-1/2 z-40 flex w-full max-w-xs -translate-x-1/2 px-4 sm:left-auto sm:right-4 sm:w-auto sm:max-w-none sm:px-0 sm:translate-x-0">
        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-end">
          <button
            type="button"
            onClick={() => setShowAbout(true)}
            className="group flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-medium backdrop-blur bg-white dark:bg-slate-800 border-slate-900 dark:border-slate-900 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors sm:w-auto sm:justify-start"
            aria-label="About this project"
          >
            About this project
          </button>

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
            className={`group flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-medium backdrop-blur bg-white dark:bg-slate-800 transition-colors sm:w-auto sm:justify-start border-slate-900 dark:border-slate-900 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700`}
            aria-pressed={hasConsent}
            aria-label="Toggle data sharing consent"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${hasConsent ? '' : 'bg-slate-400 dark:bg-slate-500'}`} style={hasConsent ? { backgroundColor: 'rgb(143, 177, 120)' } : {}} />
            {hasConsent ? 'Data sharing: ON' : 'Data sharing: OFF'}
          </button>
        </div>
      </div>

      </div>
    </>
  )
}

export default App
