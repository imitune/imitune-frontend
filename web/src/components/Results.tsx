import type { SearchResult } from '../lib/api/search'

type Props = {
  results: SearchResult[]
}

// Extract sound ID from Freesound URL
function extractSoundId(freesoundUrl: string): string | null {
  // Match patterns like: https://freesound.org/people/username/sounds/123456/
  const match = freesoundUrl.match(/\/sounds\/(\d+)\/?/)
  return match ? match[1] : null
}

export default function Results({ results }: Props) {
  if (!results.length) {
    return <p className="text-sm text-slate-600">No results yet. Record and search.</p>
  }
  
  return (
    <div className="space-y-4">
      {/* <p className="text-sm text-slate-600">Found {results.length} matching sounds</p> */}
      <div className="grid gap-6 md:grid-cols-3">
        {results.map((result) => {
          const soundId = extractSoundId(result.freesound_url)
          
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
              
              <a
                href={result.freesound_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                View on Freesound →
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}

