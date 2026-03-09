import { useEffect, useState } from 'react'
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
  const [ratingsByRow, setRatingsByRow] = useState<Record<string, Rating[]>>({})

  useEffect(() => {
    setRatingsByRow((previousRatings) => Object.fromEntries(
      rows.map((row) => [
        row.indexId,
        row.results.map((_, index) => previousRatings[row.indexId]?.[index] ?? -1),
      ]),
    ))
  }, [rows])

  const handleRowRatingsChange = (row: MultiIndexSearchRow, ratings: Rating[]) => {
    setRatingsByRow((previousRatings) => {
      const nextRatings = {
        ...previousRatings,
        [row.indexId]: ratings,
      }

      if (onSubmitRatings) {
        onSubmitRatings(buildSubmission(rows, nextRatings))
      }

      return nextRatings
    })
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
            <Results
              results={row.results}
              ratings={ratingsByRow[row.indexId] ?? row.results.map(() => -1)}
              onRatingsChange={(nextRatings) => handleRowRatingsChange(row, nextRatings)}
            />
          )}
        </section>
      ))}
    </div>
  )
}