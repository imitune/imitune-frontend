import { useCallback, useRef, useState } from 'react'
import { recordUpToSeconds, type Recording } from '../lib/audio/recorder'

type Props = {
  onRecorded: (rec: Recording) => void
}

export default function Recorder({ onRecorded }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const isActive = useRef(false)

  const handleRecord = useCallback(async () => {
    if (isActive.current) return
    isActive.current = true
    setIsRecording(true)
    try {
      const rec = await recordUpToSeconds(10)
      onRecorded(rec)
    } catch (e) {
      console.error(e)
    } finally {
      setIsRecording(false)
      isActive.current = false
    }
  }, [onRecorded])

  return (
    <button
      className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-50"
      onClick={handleRecord}
      disabled={isRecording}
    >
      {isRecording ? 'Recording…' : 'Record'}
    </button>
  )
}

