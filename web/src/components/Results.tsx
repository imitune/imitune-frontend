import { useEffect, useState } from 'react'
import type { SearchResult } from '../lib/api/search'

type Rating = -1 | 0 | 1

type Props = {
  results: SearchResult[]
  onSubmitRatings?: (ratings: { urls: string[]; ratings: Rating[] }) => void
  submitted?: boolean
  submitting?: boolean
}

// Extract sound ID from Freesound URL
function extractSoundId(freesoundUrl: string): string | null {
  // Match patterns like: https://freesound.org/people/username/sounds/123456/
  const match = freesoundUrl.match(/\/sounds\/(\d+)\/?/)
  return match ? match[1] : null
}

export default function Results({ results, onSubmitRatings, submitted = false, submitting = false }: Props) {
  if (!results.length) {
    return <p className="text-sm text-slate-600">No results yet. Record and search.</p>
  }
  const [ratings, setRatings] = useState<Rating[]>(() => results.map(() => -1))
  // Reset ratings when results change
  useEffect(() => {
    setRatings(results.map(() => -1))
  }, [results])

  const anyRated = ratings.some(r => r !== -1)
  const handleRate = (idx: number, value: Rating) => {
    setRatings(prev => prev.map((r, i) => (i === idx ? value : r)))
  }
  const handleSubmit = () => {
    if (!onSubmitRatings) return
    onSubmitRatings({ urls: results.map(r => r.freesound_url), ratings })
  }
  
  return (
    <div className="space-y-4">
      {/* <p className="text-sm text-slate-600">Found {results.length} matching sounds</p> */}
  <div className="grid gap-3 md:grid-cols-3">
        {results.map((result) => {
          const soundId = extractSoundId(result.freesound_url)
      const idx = results.indexOf(result)
      const current = ratings[idx]
      // Visual scale factor to "zoom out" the embedded Freesound player without needing an alternate embed size
  const playerScale = 0.85 // adjust between 0.5 - 0.85 if you want smaller or larger
      const basePlayerHeight = 245 // original iframe height used previously
      const scaledHeight = Math.round(basePlayerHeight * playerScale)
          
          return (
            <div key={result.id} className="p-0">
              
              {soundId ? (
                <div
                  className="relative w-full overflow-hidden rounded border border-slate-900 dark:border-slate-900 bg-transparent"
                  style={{ height: scaledHeight }}
                >
                  <iframe
                    frameBorder="0"
                    scrolling="no"
                    src={`https://freesound.org/embed/sound/iframe/${soundId}/simple/large/`}
                    // Make iframe larger so that after scaling it still covers container width
                    style={{
                      transform: `scale(${playerScale})`,
                      transformOrigin: 'top left',
                      width: `${100 / playerScale}%`,
                      height: basePlayerHeight,
                      border: '0'
                    }}
                    title={`Sound ${soundId}`}
                    allow="autoplay; encrypted-media"
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center rounded border bg-slate-50" style={{height: scaledHeight}}>
                  <p className="text-sm text-slate-500">Unable to load player</p>
                </div>
              )}
              
              <div className="mt-3 flex items-center justify-between">
                <a
                  href={result.freesound_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                >
                  View on Freesound ↗
                </a>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleRate(idx, current === 1 ? -1 : 1)}
                    className={`h-9 w-9 rounded-full text-sm font-semibold transition-colors border-2 flex items-center justify-center ${current === 1 ? 'text-white' : 'border-slate-300 text-slate-600 bg-transparent hover:bg-green-50 dark:hover:bg-slate-700'}`}
                    style={current === 1 ? { borderColor: 'rgb(143, 177, 120)', backgroundColor: 'rgb(143, 177, 120)' } : {}}
                    aria-pressed={current === 1}
          aria-label={current === 1 ? 'Remove like' : 'Like'}
                  >
          👍
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRate(idx, current === 0 ? -1 : 0)}
                    className={`h-9 w-9 rounded-full text-sm font-semibold transition-colors border-2 flex items-center justify-center ${current === 0 ? 'text-white' : 'border-slate-300 text-slate-600 bg-transparent hover:bg-red-50 dark:hover:bg-slate-700'}`}
                    style={current === 0 ? { borderColor: 'rgb(220, 80, 80)', backgroundColor: 'rgb(220, 80, 80)' } : {}}
                    aria-pressed={current === 0}
          aria-label={current === 0 ? 'Remove dislike' : 'Dislike'}
                  >
                    👎
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
  <div className="pt-1 min-h-0">
        {!submitted && anyRated && (
          <button
            type="button"
            onClick={handleSubmit}
      disabled={submitting}
            className={`green-glow-action-button rounded-xl px-4 py-2 text-sm font-medium text-black dark:text-white border border-slate-900 dark:border-slate-900 hover:opacity-90 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${anyRated && !submitting ? 'glow-active' : ''}`}
          >
      {submitting ? 'Submitting…' : 'Submit ratings'}
          </button>
        )}
        {submitted && (
          <p className="text-sm">Thank you for contributing to open research ♡</p>
        )}
      </div>
    </div>
  )
}

