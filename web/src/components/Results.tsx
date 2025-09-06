type Props = {
  urls: string[]
}

export default function Results({ urls }: Props) {
  if (!urls.length) {
    return <p className="text-sm text-slate-600">No results yet. Record and search.</p>
  }
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {urls.map((url) => (
        <iframe
          key={url}
          className="aspect-video w-full rounded-lg border"
          src={url}
          allow="autoplay"
        />
      ))}
    </div>
  )
}

