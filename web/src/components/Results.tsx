import { useEffect, useState } from 'react'
import type { SearchResult } from '../lib/api/search'

type Rating = -1 | 0 | 1

type Props = {
  results: SearchResult[]
  onSubmitRatings?: (ratings: { urls: string[]; ratings: Rating[] }) => void
  submitted?: boolean
}

// Extract sound ID from Freesound URL
function extractSoundId(freesoundUrl: string): string | null {
  // Match patterns like: https://freesound.org/people/username/sounds/123456/
  const match = freesoundUrl.match(/\/sounds\/(\d+)\/?/)
  return match ? match[1] : null
}

export default function Results({ results, onSubmitRatings, submitted = false }: Props) {
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
    <div className="grid gap-6 md:grid-cols-3">
        {results.map((result) => {
          const soundId = extractSoundId(result.freesound_url)
      const idx = results.indexOf(result)
      const current = ratings[idx]
          
          return (
            <div key={result.id} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-end">
                <span className="text-sm font-medium text-green-600">
                  {(result.score * 100).toFixed(1)}% match
                </span>
              </div>
              
              {soundId ? (
                <iframe
                  frameBorder="0"
                  scrolling="no"
                  src={`https://freesound.org/embed/sound/iframe/${soundId}/simple/large/`}
                  width="100%"
                  height="245"
                  className="rounded border"
                  title={`Sound ${soundId}`}
                  allow="autoplay; encrypted-media"
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                />
              ) : (
                <div className="flex h-[245px] items-center justify-center rounded border bg-slate-50">
                  <p className="text-sm text-slate-500">Unable to load player</p>
                </div>
              )}
              
              <div className="mt-3 flex items-center justify-between">
                <a
                  href={result.freesound_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Freesound ↗
                </a>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRate(idx, current === 1 ? -1 : 1)}
                    className={`h-7 w-7 rounded-full text-xs font-semibold transition-colors border ${current === 1 ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 text-slate-600 hover:bg-green-100'}`}
                    aria-pressed={current === 1}
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRate(idx, current === 0 ? -1 : 0)}
                    className={`h-7 w-7 rounded-full text-xs font-semibold transition-colors border ${current === 0 ? 'bg-red-500 border-red-500 text-white' : 'border-slate-300 text-slate-600 hover:bg-red-100'}`}
                    aria-pressed={current === 0}
                  >
                    👎
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="pt-2 min-h-[2.25rem]">
        {!submitted && anyRated && (
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            Submit ratings
          </button>
        )}
        {submitted && (
          <p className="text-sm text-green-600">Thank you for contributing to open research! ♡</p>
        )}
      </div>
    </div>
  )
}

