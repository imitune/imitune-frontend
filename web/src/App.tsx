import { useEffect, useMemo, useState } from 'react'
import './App.css'
import soundalikeLogo from './assets/soundalike.svg'
import DevResults from './components/DevResults'
import Recorder from './components/Recorder'
import Results from './components/Results'
import { RateLimitError } from './lib/api/errors'
import { submitFeedback, type RatingSubmission } from './lib/api/ratings'
import { searchAcrossIndexes, searchByEmbedding, type MultiIndexSearchRow, type SearchResult } from './lib/api/search'
import type { Recording } from './lib/audio/recorder'
import { installTauriLinkHandling, isDesktopApp } from './lib/desktop/runtime'
import { audioBlobToMonoFloat32, loadSession, runEmbedding } from './lib/model/embedding'

const FEEDBACK_CONSENT_KEY = 'thatsoundslikeme_feedback_consent_v1'
const PREVIOUS_BRAND_CONSENT_KEY = 'thatsoundlikeme_feedback_consent_v1'
const LEGACY_FEEDBACK_CONSENT_KEY = 'imitune_feedback_consent_v1'

function loadFeedbackConsent() {
  try {
    if (localStorage.getItem(FEEDBACK_CONSENT_KEY) === 'true') return true
    if (localStorage.getItem(PREVIOUS_BRAND_CONSENT_KEY) === 'true') {
      localStorage.setItem(FEEDBACK_CONSENT_KEY, 'true')
      localStorage.removeItem(PREVIOUS_BRAND_CONSENT_KEY)
      return true
    }
    if (localStorage.getItem(LEGACY_FEEDBACK_CONSENT_KEY) === 'true') {
      localStorage.setItem(FEEDBACK_CONSENT_KEY, 'true')
      localStorage.removeItem(LEGACY_FEEDBACK_CONSENT_KEY)
      return true
    }
  } catch {
    // Feedback still works for the current session if persistent storage is unavailable.
  }
  return false
}

function App() {
  const desktopApp = isDesktopApp()
  const [results, setResults] = useState<SearchResult[]>([])
  const [devRows, setDevRows] = useState<MultiIndexSearchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedbackRateLimitMessage, setFeedbackRateLimitMessage] = useState<string | null>(null)
  const [embedding, setEmbedding] = useState<Float32Array | null>(null)
  const [processingEmbedding, setProcessingEmbedding] = useState(false)
  const [hasValidAudio, setHasValidAudio] = useState(false)
  const [lastRecordingBlob, setLastRecordingBlob] = useState<Blob | null>(null)
  const [hasConsent, setHasConsent] = useState(loadFeedbackConsent)
  const [showConsent, setShowConsent] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [submittedAudioId, setSubmittedAudioId] = useState<string | null>(null)
  const [pendingRatingsData, setPendingRatingsData] = useState<RatingSubmission | null>(null)
  const [hasReadDocuments, setHasReadDocuments] = useState(true)
  const [hasAgreedToConsent, setHasAgreedToConsent] = useState(true)
  const devModeEnabled = ((import.meta.env.VITE_ENABLE_DEV_MODE as string | undefined) ?? 'false').toLowerCase() === 'true'
  const normalizedBasePath = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')
  const normalizedPathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const routePath = normalizedBasePath && normalizedPathname.startsWith(normalizedBasePath)
    ? normalizedPathname.slice(normalizedBasePath.length) || '/'
    : normalizedPathname
  const isDevRoute = routePath === '/dev'
  const isDevPage = devModeEnabled && isDevRoute
  const homeHref = import.meta.env.BASE_URL
  const devHref = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/dev`
  const isUnavailableDevRoute = isDevRoute && !devModeEnabled
  
  // List of sound examples with emojis
  const soundExamples = useMemo(() => ([
    { sound: 'beep beep', emoji: '⏰' },
    { sound: 'woof woof', emoji: '🐶' },
    { sound: 'ding dong', emoji: '🔔' },
    { sound: 'chirp chirp', emoji: '🐦' },
    { sound: 'bzzzzz', emoji: '🐝' },
    { sound: 'meow', emoji: '🐱' },
    { sound: 'cluck cluck', emoji: '🐔' },
    { sound: 'tweet tweet', emoji: '🐤' },
    { sound: 'ahem ahem', emoji: '😮‍💨' },
    { sound: 'crack!', emoji: '⚡' },
    { sound: 'crackle crackle', emoji: '🔥' },
    { sound: 'chirrrp', emoji: '🦗' },
    { sound: 'caw caw', emoji: '🐦‍⬛' },
    { sound: 'ding dong', emoji: '🏠' },
    { sound: 'drip drop', emoji: '💧' },
    { sound: 'boooom', emoji: '💥' },
    { sound: 'pfffft', emoji: '💨' },
    { sound: 'boom boom', emoji: '🎆' },
    { sound: 'ribbit ribbit', emoji: '🐸' },
    { sound: 'gasp!', emoji: '😲' },
    { sound: 'teehee', emoji: '🤭' },
    { sound: 'grrrr', emoji: '🐺' },
    { sound: 'bang!', emoji: '🔫' },
    { sound: 'glug glug', emoji: '🫧' },
    { sound: 'hissss', emoji: '🐍' },
    { sound: 'prrrr', emoji: '🐈' },
    { sound: 'rattle rattle', emoji: '🪇' },
    { sound: 'skreeech', emoji: '🦅' },
    { sound: 'splash', emoji: '🌊' },
    { sound: 'thud', emoji: '🪨' },
    { sound: 'tick tock', emoji: '🕰️' },
    { sound: 'whoosh', emoji: '🌬️' },
    { sound: 'wooo', emoji: '🍃' },
    { sound: 'zzzip', emoji: '🤐' },
    { sound: 'vroom vroom', emoji: '🚗' },
    { sound: 'crunch', emoji: '🍁' },
  ]), [])
  
  // Select 3 random examples
  const randomExamples = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- Examples are intentionally randomized once per page load.
    const shuffled = [...soundExamples].sort(() => 0.5 - Math.random())
    const first = shuffled[0] ?? soundExamples[0]!
    const second = shuffled[1] ?? soundExamples[1] ?? first
    const third = shuffled[2] ?? soundExamples[2] ?? second
    return [first, second, third] as const
  }, [soundExamples])

  const [session, setSession] = useState<Awaited<ReturnType<typeof loadSession>> | null>(null)
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

  useEffect(() => installTauriLinkHandling(), [])

  useEffect(() => {
    let mounted = true
    if (!apiUrl && !desktopApp) {
      console.warn('Search API URL is undefined. Set VITE_API_URL or VITE_BACKEND_BASE.')
    }
    if (!feedbackUrl && !desktopApp) {
      console.warn('Feedback API URL is undefined. Set VITE_FEEDBACK_URL, VITE_BACKEND_BASE, or VITE_API_URL ending in /api/search.')
    }
    loadSession(modelUrl)
      .then((s) => {
        if (mounted) {
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
  }, [modelUrl, apiUrl, feedbackUrl, backendBase, rawApiSearchUrl, desktopApp])

  // Process embedding when session becomes available and we have valid audio but no embedding yet
  useEffect(() => {
    const processDelayedEmbedding = async () => {
      if (session && hasValidAudio && !embedding && lastRecordingBlob && !processingEmbedding) {
        try {
          setProcessingEmbedding(true)
          const mono = await audioBlobToMonoFloat32(lastRecordingBlob, 32000)
          const { vector } = await runEmbedding(session, mono)
          setEmbedding(vector)
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
    setError(null)
    setFeedbackRateLimitMessage(null)
    setResults([])
    setDevRows([])
    setEmbedding(null)
    setHasValidAudio(false) // Reset audio validation
    setLastRecordingBlob(rec.blob)
    setSubmittedAudioId(null) // Reset audioId for new query
    
    // Always validate audio content first, regardless of session state
    try {
      const mono = await audioBlobToMonoFloat32(rec.blob, 32000) // Downsample to 32kHz
      
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
        setError('Recording appears to be empty or too quiet. Please try recording again.')
        return
      }
      
      setHasValidAudio(true) // Mark audio as valid immediately after validation
      
      // Process embedding if session is available
      if (session) {
        try {
          setProcessingEmbedding(true)
          const { vector } = await runEmbedding(session, mono)
          setEmbedding(vector)
        } catch (e) {
          console.error('Error processing embedding:', e)
          setError(`Failed to process embedding: ${String(e)}`)
        } finally {
          setProcessingEmbedding(false)
        }
      }
    } catch (e) {
      console.error('Error validating audio:', e)
      setError(`Failed to process audio: ${String(e)}`)
    }
  }

  const onSearch = async () => {
    if (!embedding || (!apiUrl && !desktopApp)) return
    try {
      setError(null)
      setFeedbackRateLimitMessage(null)
      setLoading(true)
      setSubmittedAudioId(null) // Reset audioId for new search results

      if (isDevPage) {
        if (!apiUrl) throw new Error('Search API URL is not configured for dev mode.')
        const response = await searchAcrossIndexes(apiUrl, embedding)
        setResults([])
        setDevRows(response.rows)
        return
      }

      const urls = await searchByEmbedding(apiUrl, embedding)
      setDevRows([])
      setResults(urls)
    } catch (e) {
      if (e instanceof RateLimitError) {
        const retry = e.retryAfterSeconds
          ? ` Please try again in ${e.retryAfterSeconds} seconds.`
          : ' Please try again shortly.'
        setError(`Too many searches from this network.${retry}`)
      } else {
        setError(String(e))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitRatings = async (data: RatingSubmission) => {
    if (!feedbackUrl && !desktopApp) {
      console.warn('Feedback endpoint not configured.')
      return
    }
    try {
      // Map ratings to API spec (like/dislike/null)
      const mappedRatings = data.ratings.map(r => r === 1 ? 'like' : r === 0 ? 'dislike' : null) as ("like"|"dislike"|null)[]
      const freesoundUrls = data.urls.map(u => u || null)
      
      let response
      if (submittedAudioId) {
        // Update existing submission using audioId reference
        response = await submitFeedback(feedbackUrl, {
          audioId: submittedAudioId,
          freesound_urls: freesoundUrls,
          ratings: mappedRatings,
          result_contexts: data.resultContexts,
        })
      } else {
        // First submission - include audio
        if (!lastRecordingBlob) {
          console.warn('No recorded audio available')
          return
        }
        const audioBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(lastRecordingBlob)
        })
        response = await submitFeedback(feedbackUrl, {
          audioQuery: audioBase64,
          freesound_urls: freesoundUrls,
          ratings: mappedRatings,
          result_contexts: data.resultContexts,
        })
        // Store audioId for future updates
        setSubmittedAudioId(response.audioId)
      }
      setFeedbackRateLimitMessage(null)
    } catch (feedbackError: unknown) {
      const message = feedbackError instanceof Error ? feedbackError.message : String(feedbackError)
      console.error('Failed to submit ratings:', message)
      if (feedbackError instanceof RateLimitError) {
        const retry = feedbackError.retryAfterSeconds
          ? ` Please try again in ${feedbackError.retryAfterSeconds} seconds.`
          : ' Please try again shortly.'
        setFeedbackRateLimitMessage(
          `Too many ratings have been submitted from this network.${retry}`,
        )
      }
    }
  }

  // Gatekeeper that checks consent before actually submitting
  const requestSubmitRatings = (data: RatingSubmission) => {
    if (hasConsent) {
      void handleSubmitRatings(data)
    } else {
      setPendingRatingsData(data)
      setHasReadDocuments(true)
      setHasAgreedToConsent(true)
      setShowConsent(true)
    }
  }

  const acceptConsentAndSubmit = () => {
    if (!hasReadDocuments || !hasAgreedToConsent) {
      return // Extra safety check
    }
    try {
      localStorage.setItem(FEEDBACK_CONSENT_KEY, 'true')
    } catch {
      // Feedback still works for this session if persistent storage is unavailable.
    }
    setHasConsent(true)
    setShowConsent(false)
    
    if (pendingRatingsData) {
      const data = pendingRatingsData
      setPendingRatingsData(null)
      setHasReadDocuments(false)
      setHasAgreedToConsent(false)
      void handleSubmitRatings(data)
    } else {
      // Just turning on data sharing, no ratings to submit
      setHasReadDocuments(false)
      setHasAgreedToConsent(false)
    }
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
  <header className="mb-5 grid gap-1 text-center lg:grid-cols-[auto,1fr] lg:items-center lg:text-left">
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
  <div className="text-xl text-black dark:text-slate-300 text-center lg:text-right">
            <span className="quintessential-regular" style={{ fontStyle: 'italic' }}>*Magically*  </span> search for sounds with your voice
          </div>
          <div className="flex items-center gap-3 justify-self-center lg:justify-self-end lg:col-start-2 lg:-mt-4">
            <a
              href="https://github.com/thatsoundslikeme"
              target="_blank"
              rel="noreferrer"
              aria-label="ThatSoundsLikeMe on GitHub"
              className="text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.168 6.839 9.49.5.092.683-.217.683-.483 0-.237-.009-.866-.014-1.7-2.782.604-3.369-1.34-3.369-1.34-.455-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.004.07 1.532 1.03 1.532 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.349-1.087.635-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.092.39-1.985 1.03-2.684-.104-.253-.446-1.272.098-2.65 0 0 .84-.269 2.75 1.026A9.563 9.563 0 0112 6.8c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.026 2.748-1.026.546 1.378.203 2.397.1 2.65.64.699 1.028 1.592 1.028 2.684 0 3.843-2.339 4.687-4.566 4.935.358.308.678.916.678 1.846 0 1.333-.012 2.41-.012 2.738 0 .268.18.58.688.482A10.002 10.002 0 0022 12c0-5.523-4.477-10-10-10z" />
              </svg>
            </a>
            <button
              type="button"
              onClick={() => setShowAbout(true)}
              className="text-base text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 underline transition-colors"
              aria-label="About this project"
            >
              Learn more about this project ↗
            </button>
          </div>
        </header>

        {isDevRoute && (
          <div className="mb-5 flex justify-center gap-2 lg:justify-end">
            <a
              href={homeHref}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-[#202020]"
            >
              Main search
            </a>
            {devModeEnabled && (
              <a
                href={devHref}
                className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
              >
                Compare indexes
              </a>
            )}
          </div>
        )}

        {isUnavailableDevRoute ? (
          <section className="mb-6 rounded-xl border border-slate-900 p-6 dark:border-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Dev comparison mode is disabled on this deployment.</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Set <code>VITE_ENABLE_DEV_MODE=true</code> in the frontend build and <code>ENABLE_DEV_MODE=true</code> in the backend deployment to enable the /dev comparison page.
            </p>
            <div className="mt-4">
              <a href={homeHref} className="text-sm font-medium text-sky-600 hover:underline dark:text-sky-400">Return to the main search</a>
            </div>
          </section>
        ) : (
          <>

        <section className="mb-5 rounded-xl border border-slate-900 dark:border-slate-900 p-6">
          <Recorder
            onRecorded={onRecorded}
            centerContent={
              <>
                <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                  {isDevPage ? 'Compare all configured retrieval indexes 🎙️' : "Imitate the sound that's in your mind 🎙️"}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {isDevPage ? (
                    <>
                      We will run one embedding against all configured Pinecone indexes and show the top matches side by side. Try <em>{randomExamples[0].sound}</em> {randomExamples[0].emoji}, <em>{randomExamples[1].sound}</em> {randomExamples[1].emoji}, or <em>{randomExamples[2].sound}</em> {randomExamples[2].emoji}
                    </>
                  ) : (
                    <>
                      <span className="font-bold">Stuck?</span> Try <em>{randomExamples[0].sound}</em> {randomExamples[0].emoji}, <em>{randomExamples[1].sound}</em> {randomExamples[1].emoji}, or <em>{randomExamples[2].sound}</em> {randomExamples[2].emoji}
                    </>
                  )}
                </p>
                {/* Removed transient processing text to avoid layout shift */}
              </>
            }
            extraButton={
              <button className={`yellow-glow-action-button flex w-full items-center justify-center rounded-xl border border-slate-900 dark:border-slate-900 px-4 py-2 text-base font-medium text-black dark:text-white hover:opacity-90 disabled:opacity-50 md:w-auto ${embedding && hasValidAudio && !loading && !processingEmbedding && results.length === 0 && devRows.length === 0 ? 'glow-active' : ''}`} disabled={loading || !embedding || !hasValidAudio || (!apiUrl && !desktopApp) || processingEmbedding} onClick={onSearch}>
                {loading ? (isDevPage ? 'Comparing…' : 'Searching…') : processingEmbedding ? 'Processing…' : (isDevPage ? 'Compare indexes ✨' : 'Search ✨')}
              </button>
            }
          />

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {/* Audio preview handled by the in-box player; no native audio element */}
        </section>

        {!isDevPage && results.length > 0 && (
          <section className="results-enter mb-6 rounded-xl border border-slate-900 dark:border-slate-900 p-6">
            <div className="mb-4 flex items-baseline justify-center gap-3 text-center">
              <h2 className="text-sm md:text-base font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                Here are the best matches we found!
              </h2>
              <span className="text-xs md:text-sm font-normal text-slate-500 dark:text-slate-400 italic">
                You can rate if the match is good <span aria-hidden="true">👍</span> or not <span aria-hidden="true">👎</span>
              </span>
            </div>

            <div className="mt-4">
              {feedbackRateLimitMessage && (
                <p
                  role="alert"
                  aria-live="assertive"
                  className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-center text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                >
                  {feedbackRateLimitMessage}
                </p>
              )}
              <Results results={results} onSubmitRatings={requestSubmitRatings} />
            </div>
          </section>
        )}

        {isDevPage && devRows.length > 0 && (
          <section className="results-enter mb-6 rounded-xl border border-slate-900 dark:border-slate-900 p-6">
            <div className="mb-4 flex flex-col items-center gap-2 text-center">
              <h2 className="text-sm md:text-base font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                Side-by-side comparison across all configured indexes
              </h2>
              <span className="text-xs md:text-sm font-normal text-slate-500 dark:text-slate-400 italic">
                Ratings are stored with the source index so you can analyze which retrieval setup performs best.
              </span>
            </div>

            <div className="mt-4">
              {feedbackRateLimitMessage && (
                <p
                  role="alert"
                  aria-live="assertive"
                  className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-center text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                >
                  {feedbackRateLimitMessage}
                </p>
              )}
              <DevResults rows={devRows} onSubmitRatings={requestSubmitRatings} />
            </div>
          </section>
        )}
          </>
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
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                and supported by UK Research and Innovation (grant number EP/S022694/1)
              </p>
            </div>

            {/* Copyright */}
            <p className="text-xs text-slate-500 dark:text-slate-500">© 2026 thatsoundslike.me. All rights reserved.</p>
            <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <a href={`${import.meta.env.BASE_URL}privacy.html`} className="hover:underline">Privacy</a>
              <a href={`${import.meta.env.BASE_URL}code-signing-policy.html`} className="hover:underline">Code signing policy</a>
              <a href={`${import.meta.env.BASE_URL}download.html`} className="hover:underline">Downloads</a>
            </p>
          </div>
        </footer>

      </div>
      {/* Consent Modal */}
      {showConsent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={cancelConsent} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="relative z-10 w-full max-w-md rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-[#202020] p-6 max-h-[90vh] overflow-y-auto">
        <h3 id="consent-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Research Study Consent</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 text-left">
          By default, all recordings and feedback you record exist exclusively on your device, not our server.<br /><br />
          
          However, we are running a study to understand how to improve these models, which involves collecting anonymised user recordings and ratings.<br /><br />

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
           - in short, we're students and researchers at Queen Mary University of London, and we've built this as a fun tool to help with open-source research!
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
          <button type="button" onClick={cancelConsent} className="rounded-md px-4 py-2 text-sm font-medium border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-transparent hover:bg-slate-50 dark:hover:bg-[#202020]">Cancel</button>
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
          <div role="dialog" aria-modal="true" aria-labelledby="about-title" className="relative z-10 w-full max-w-md rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-[#202020] p-6">
        <h3 id="about-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">About this project</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          thatsoundslike.me is built and maintained by{" "}
          <a href="https://chrispla.me" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline">Christos Plachouras</a>,{" "}
          <a href="https://uk.linkedin.com/in/adibh" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline">Aditya Bhattacharjee</a>, and{" "}
          <a href="https://uk.linkedin.com/in/mimbres-101" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline">Sungkyun Chang</a>, researchers at Queen Mary University of London.<br /><br />
          After participating in a challenge to build machine learning models for matching vocal imitations with target sounds, we thought of making this website as a fun, non-commercial application of the technology, that could help people discover new sounds and contribute to improving the underlying models.<br /><br />
          We designed this website with privacy in mind: unless you specifically agree to take part in our study, your recording is processed and stored ONLY on your device, not our servers. This is possible by having developed a tiny model that can run entirely in your browser with ONNX.<br /><br />
          If you consent to data collection and submit likes or dislikes to returned sounds, you help us collect data to improve open-source query by vocal imitation models!
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Read our <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline">privacy policy</a> and <a href={`${import.meta.env.BASE_URL}code-signing-policy.html`} target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline">code signing policy</a>.
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          We hope you enjoy playing around with the website! For feedback or questions, email c dοt plachouras αt qmul dοt ac dοt uk.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={() => setShowAbout(false)} className="rounded-md px-4 py-2 text-sm font-medium border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-transparent hover:bg-slate-50 dark:hover:bg-[#202020]">Close</button>
        </div>
          </div>
        </div>
      )}
      {/* Data sharing toggle - optional, positioned bottom-right */}
  <div className="fixed bottom-4 left-1/2 z-40 flex w-full max-w-xs -translate-x-1/2 px-4 sm:left-auto sm:right-4 sm:w-auto sm:max-w-none sm:px-0 sm:translate-x-0">
        <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-end">
          <button
            type="button"
            onClick={() => {
              if (hasConsent) {
                // Turning off
                setHasConsent(false)
                try {
                  localStorage.removeItem(FEEDBACK_CONSENT_KEY)
                  localStorage.removeItem(PREVIOUS_BRAND_CONSENT_KEY)
                  localStorage.removeItem(LEGACY_FEEDBACK_CONSENT_KEY)
                } catch {
                  // The in-memory consent state is still updated below.
                }
              } else {
                // Turning on triggers modal for explicit acceptance
                setPendingRatingsData(null)
                setHasReadDocuments(true)
                setHasAgreedToConsent(true)
                setShowConsent(true)
              }
            }}
            className={`group flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-medium backdrop-blur bg-white dark:bg-[#202020] transition-colors sm:w-auto sm:justify-start border-slate-900 dark:border-slate-900 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-[#282828]`}
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
