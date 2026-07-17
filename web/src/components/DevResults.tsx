import { useState } from 'react'
import type { RatingSubmission } from '../lib/api/ratings'
import type { MultiIndexSearchRow } from '../lib/api/search'
import Results, { type Rating } from './Results'

type Props = {
  rows: MultiIndexSearchRow[]
  onSubmitRatings?: (submission: RatingSubmission) => void
}

function buildSubmission(rows: MultiIndexSearchRow[], ratingsByRow: Record<string, Rating[]>): RatingSubmission {
  const urls: string[] = []
  const ratings: Rating[] = []
  const resultContexts: NonNullable<RatingSubmission['resultContexts']> = []

  rows.forEach((row) => {
    row.results.forEach((result, index) => {
      urls.push(result.freesound_url)
      ratings.push(ratingsByRow[row.indexId]?.[index] ?? -1)
      resultContexts.push({
        route: 'dev',
        indexId: row.indexId,
        indexLabel: row.indexLabel,
        rank: index + 1,
        freesound_url: result.freesound_url,
      })
    })
  })

  return {
    urls,
    ratings,
    resultContexts,
  }
}

export default function DevResults({ rows, onSubmitRatings }: Props) {
  const [ratingState, setRatingState] = useState<{ rows: MultiIndexSearchRow[]; values: Record<string, Rating[]> }>(() => ({
    rows,
    values: {},
  }))
  const [loadedState, setLoadedState] = useState<{ rows: MultiIndexSearchRow[]; values: Record<string, boolean> }>(() => ({
    rows,
    values: {},
  }))
  const ratingsByRow = ratingState.rows === rows ? ratingState.values : {}
  const loadedRows = loadedState.rows === rows ? loadedState.values : {}

  const handleRowRatingsChange = (row: MultiIndexSearchRow, ratings: Rating[]) => {
    setRatingState(() => {
      const nextRatings = {
        ...ratingsByRow,
        [row.indexId]: ratings,
      }

      if (onSubmitRatings) {
        onSubmitRatings(buildSubmission(rows, nextRatings))
      }

      return { rows, values: nextRatings }
    })
  }

  const handleLoadRow = (row: MultiIndexSearchRow) => {
    setLoadedState({ rows, values: { ...loadedRows, [row.indexId]: true } })
  }

  return (
    <div className="space-y-6">
      {rows.map((row) => (
        <section key={row.indexId} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-4 flex flex-col items-start gap-1 text-left sm:flex-row sm:items-baseline sm:justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.indexLabel}</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">Index id: {row.indexId}</span>
          </div>

          {row.error ? (
            <p className="text-sm text-red-600">{row.error}</p>
          ) : (
            <>
              {loadedRows[row.indexId] ? (
                <Results
                  results={row.results}
                  ratings={ratingsByRow[row.indexId] ?? row.results.map(() => -1)}
                  onRatingsChange={(nextRatings) => handleRowRatingsChange(row, nextRatings)}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 dark:bg-[#202020]">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Load all 4 players in this row on demand to keep the comparison page responsive.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleLoadRow(row)}
                      className="shrink-0 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Load row players
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {row.results.map((result, index) => (
                      <div key={result.id} className="space-y-3">
                        <div className="flex items-center justify-center rounded border border-slate-900 bg-slate-50 px-4 text-center dark:border-slate-900 dark:bg-[#202020]" style={{ height: 208 }}>
                          <p className="text-sm text-slate-500">Player ready to load</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <a
                            href={result.freesound_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                          >
                            View on Freesound ↗
                          </a>
                          <span className="text-xs text-slate-400 dark:text-slate-500">Rank {index + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      ))}
    </div>
  )
}
