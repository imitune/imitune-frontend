import type { SearchResult } from '../lib/api/search'

type Props = {
  results: SearchResult[]
}

export default function Results({ results }: Props) {
  if (!results.length) {
    return <p className="text-sm text-slate-600">No results yet. Record and search.</p>
  }
  
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Found {results.length} matching sounds</p>
      <div className="grid gap-4 md:grid-cols-3">
        {results.map((result) => (
          <div key={result.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">ID: {result.id}</span>
              <span className="text-xs font-medium text-green-600">
                {(result.score * 100).toFixed(1)}% match
              </span>
            </div>
            <iframe
              className="aspect-video w-full rounded border"
              src={`${result.freesound_url}embed/`}
              allow="autoplay"
              title={`Sound ${result.id}`}
            />
            <a
              href={result.freesound_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              View on Freesound →
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

