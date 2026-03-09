import { useEffect, useState } from 'react'
import type { SearchResult } from '../lib/api/search'

export type Rating = -1 | 0 | 1

type Props = {
  results: SearchResult[]
  ratings?: Rating[]
  onRatingsChange?: (ratings: Rating[]) => void
  onSubmitRatings?: (ratings: { urls: string[]; ratings: Rating[] }) => void
  embedMode?: 'eager' | 'manual'
}

// Extract sound ID from Freesound URL
function extractSoundId(freesoundUrl: string): string | null {
  // Support both canonical URLs and short URLs like https://freesound.org/s/123456/
  const match = freesoundUrl.match(/\/(?:sounds|s)\/(\d+)\/?/)
  return match ? match[1] : null
}

export default function Results({ results, ratings: controlledRatings, onRatingsChange, onSubmitRatings, embedMode = 'eager' }: Props) {
  if (!results.length) {
    return <p className="text-sm text-slate-600">No results yet. Record and search.</p>
  }
  const [internalRatings, setInternalRatings] = useState<Rating[]>(() => results.map(() => -1))
  const [loadedPlayers, setLoadedPlayers] = useState<boolean[]>(() => results.map(() => embedMode === 'eager'))
  const isControlled = controlledRatings !== undefined
  const ratings = controlledRatings ?? internalRatings

  // Reset ratings when results change
  useEffect(() => {
    if (!isControlled) {
      setInternalRatings(results.map(() => -1))
    }
  }, [results, isControlled])

  useEffect(() => {
    setLoadedPlayers(results.map(() => embedMode === 'eager'))
  }, [results, embedMode])

  const handleRate = (idx: number, value: Rating) => {
    const newRatings = ratings.map((r, i) => (i === idx ? value : r))
    if (!isControlled) {
      setInternalRatings(newRatings)
    }
    onRatingsChange?.(newRatings)
    // Auto-submit when user interacts with ratings
    if (onSubmitRatings) {
      onSubmitRatings({ urls: results.map(r => r.freesound_url), ratings: newRatings })
    }
  }

  const handleLoadPlayer = (idx: number) => {
    setLoadedPlayers((previous) => previous.map((isLoaded, index) => (index === idx ? true : isLoaded)))
  }
  
  return (
    <div className="space-y-4">
      {/* <p className="text-sm text-slate-600">Found {results.length} matching sounds</p> */}
  <div className="grid gap-3 md:grid-cols-3">
        {results.map((result, idx) => {
          const soundId = extractSoundId(result.freesound_url)
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
                  {loadedPlayers[idx] ? (
                    <iframe
                      frameBorder="0"
                      scrolling="no"
                      loading="lazy"
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
                      sandbox="allow-scripts allow-same-origin allow-presentation"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-[#202020]">
                      <button
                        type="button"
                        onClick={() => handleLoadPlayer(idx)}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Load player
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded border bg-slate-50 px-4 text-center dark:bg-[#202020]" style={{height: scaledHeight}}>
                  <p className="text-sm text-slate-500">Player unavailable for this Freesound URL format.</p>
                </div>
              )}
              
              <div className="mt-3 flex items-center justify-between">
                <a
                  href={result.freesound_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
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
    </div>
  )
}

