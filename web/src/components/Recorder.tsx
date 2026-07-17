import React, { useCallback, useEffect, useRef, useState } from 'react'
import { audioBufferToWavBlob, type Recording } from '../lib/audio/recorder'
import {
  getDesktopMicrophoneStatus,
  isDesktopApp,
  isTauriApp,
  openDesktopMicrophoneSettings,
} from '../lib/desktop/runtime'

type Props = {
  onRecorded?: (rec: Recording) => void
  maxSeconds?: number
  extraButton?: React.ReactNode
  centerContent?: React.ReactNode
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function preferredRecorderOptions(): MediaRecorderOptions | undefined {
  if (!MediaRecorder.isTypeSupported) return undefined
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm']
    .find(candidate => MediaRecorder.isTypeSupported(candidate))
  return mimeType ? { mimeType } : undefined
}

function feedbackCompatibleBlob(blob: Blob, decodedAudio: AudioBuffer): Blob {
  const supportedTypes = new Set(['audio/webm', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/mpeg'])
  return supportedTypes.has(blob.type) ? blob : audioBufferToWavBlob(decodedAudio)
}

function mixToMono(buf: AudioBuffer): Float32Array {
  const channelData = Array.from(
    { length: buf.numberOfChannels },
    (_, channel) => buf.getChannelData(channel),
  )
  const output = new Float32Array(buf.length)
  for (let index = 0; index < buf.length; index += 1) {
    let sum = 0
    for (const channel of channelData) sum += channel[index]
    output[index] = sum / channelData.length
  }
  return output
}

// Single record button component with post-record waveform + playback controls.
// Press record -> captures up to maxSeconds (default 10) or until stopped.
// After recording, waveform + play/pause shown. Press record again to discard and start fresh.
const Recorder: React.FC<Props> = ({ onRecorded, maxSeconds = 10, extraButton, centerContent }) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [requestingMic, setRequestingMic] = useState(false)
  const [micGranted, setMicGranted] = useState(false)
  const [showMicSettings, setShowMicSettings] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<number | null>(null)
  const waveformContainerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playheadRef = useRef<HTMLDivElement | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const leadingSilenceRef = useRef<number>(0) // seconds of trimmed leading silence (visual + playback offset)

  // Cleanup helpers
  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const destroyWaveform = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setReady(false)
  }

  useEffect(() => {
    return () => {
      // component unmount cleanup
      clearTimer()
      destroyWaveform()
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop()
        } catch {
          // The recorder may already be stopping during component teardown.
        }
      }
      audioCtxRef.current?.close().catch(console.error);
    }
  }, [])

  const updatePlayhead = useCallback((progress: number) => {
    if (!playheadRef.current) return
    playheadRef.current.style.left = `${(progress * 100).toFixed(4)}%`
  }, [])

  const drawWaveform = useCallback(() => {
    const audioBuf = audioBufferRef.current
    const canvas = canvasRef.current
    const wrapper = waveformContainerRef.current
    if (!audioBuf || !canvas || !wrapper) return
    const dpr = window.devicePixelRatio || 1
    const width = wrapper.clientWidth || 600
    const height = 110 // include padding region visual
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)
    const channelFull = audioBuf.numberOfChannels > 1 ? mixToMono(audioBuf) : audioBuf.getChannelData(0)
    
    // Detect dark mode for appropriate colors
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const waveformColor = isDarkMode ? '#94a3b8' : '#334155' // slate-400 for dark, slate-700 for light
    const referenceLineColor = isDarkMode ? '#64748b' : '#475569' // slate-500 for dark, slate-600 for light
    
    // Find actual content boundaries (start and end of non-silence)
    const threshold = 0.01
    let startIdx = 0
    let endIdx = channelFull.length - 1
    
    // Find start of content
    for (let i = 0; i < channelFull.length; i++) {
      if (Math.abs(channelFull[i]) > threshold) {
        startIdx = i
        break
      }
    }
    
    // Find end of content
    for (let i = channelFull.length - 1; i >= 0; i--) {
      if (Math.abs(channelFull[i]) > threshold) {
        endIdx = i
        break
      }
    }
    
    // Use content-only portion for visualization
    const channel = channelFull.slice(startIdx, endIdx + 1)
    
    // Update duration to reflect trimmed content
    const trimmedDurationStart = startIdx / audioBuf.sampleRate
    const trimmedDurationEnd = endIdx / audioBuf.sampleRate
    const contentDuration = trimmedDurationEnd - trimmedDurationStart
    
    // Store trim info for playback sync
    leadingSilenceRef.current = trimmedDurationStart
    setDuration(Math.max(0.1, contentDuration))
    
    if (channel.length === 0) {
      // No content found, draw flat line
      ctx.strokeStyle = waveformColor
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()
      
      // Draw horizontal reference line in the middle (same as the flat line in this case)
      ctx.strokeStyle = referenceLineColor
      ctx.lineWidth = 0.5 // thinner
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()
      
      setReady(true)
      updatePlayhead(0)
      return
    }
    
    // Find max amplitude for normalization
    let maxAmp = 0
    for (let i = 0; i < channel.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(channel[i]))
    }
    
    // Compute peaks
    const samplesPerPixel = Math.max(1, Math.floor(channel.length / width))
    ctx.lineWidth = 2
    ctx.strokeStyle = waveformColor
    ctx.beginPath()
    const midY = height / 2
    const scale = maxAmp > 0 ? 1 / maxAmp : 1 // normalize to use full height
    
    for (let x = 0; x < width; x++) {
      const start = x * samplesPerPixel
      let min = 0
      let max = 0
      for (let i = 0; i < samplesPerPixel && start + i < channel.length; i++) {
        const v = channel[start + i] * scale
        if (v < min) min = v
        if (v > max) max = v
      }
      const y1 = midY - min * (midY - 10) // leave 10px margin
      const y2 = midY - max * (midY - 10)
      if (Math.abs(max - min) > 0.001) { // only draw if there's actual signal
        ctx.moveTo(x, y1)
        ctx.lineTo(x, y2)
      }
    }
    ctx.stroke()
    
    // Draw horizontal reference line in the middle
    ctx.strokeStyle = referenceLineColor
    ctx.lineWidth = 0.5 // thinner than waveform
    ctx.beginPath()
    ctx.moveTo(0, midY)
    ctx.lineTo(width, midY)
    ctx.stroke()
    
    setReady(true)
    updatePlayhead(0)
  }, [updatePlayhead])

  const finalizeRecording = useCallback(async () => {
    setIsRecording(false)
    clearTimer()
    const firstChunk = chunksRef.current.find((chunk): chunk is Blob => chunk instanceof Blob)
    const rawMimeType = mediaRecorderRef.current?.mimeType || firstChunk?.type || 'audio/webm'
    const mimeType = rawMimeType.split(';', 1)[0].toLowerCase()
    const blob = new Blob(chunksRef.current, { type: mimeType })
    chunksRef.current = []
    const url = URL.createObjectURL(blob)
    objectUrlRef.current = url
    setAudioUrl(url)
    try {
      // Get sample rate + channels
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
      if (!AudioContextConstructor) throw new Error('Web Audio is not supported in this environment.')
      const audioCtx = audioCtxRef.current ?? new AudioContextConstructor()
      if (!audioCtxRef.current) audioCtxRef.current = audioCtx;

      const arrayBuf = await blob.arrayBuffer()
      const audioBuf = await audioCtx.decodeAudioData(arrayBuf)
      // Store the audio buffer for waveform processing
      audioBufferRef.current = audioBuf
      const uploadBlob = feedbackCompatibleBlob(blob, audioBuf)
      const rec: Recording = { blob: uploadBlob, url, sampleRate: audioBuf.sampleRate, numChannels: audioBuf.numberOfChannels }
      onRecorded?.(rec)
      // Prepare hidden audio element for playback control
      if (!audioElRef.current) {
        audioElRef.current = new Audio()
      }
      audioElRef.current.src = url
      audioElRef.current.onplay = () => setIsPlaying(true)
      audioElRef.current.onpause = () => setIsPlaying(false)
      audioElRef.current.onended = () => {
        setIsPlaying(false)
        updatePlayhead(0)
      }
      audioElRef.current.onerror = (e) => {
        console.error("Audio element error:", e);
        setError("An error occurred during audio playback.");
      };
      drawWaveform()
    } catch (decodeError) {
      console.error('Failed to decode audio metadata:', decodeError)
      // Non-fatal if decode fails
      setError('Failed to decode audio metadata')
    }

    // Release the device as soon as this take is complete so the operating
    // system microphone indicator and capture session do not remain active.
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    mediaRecorderRef.current = null
  }, [drawWaveform, onRecorded, updatePlayhead])

  const startRecording = useCallback(async () => {
    if (!streamRef.current) {
      setError('Microphone not ready')
      return
    }
    
    setError(null)
    destroyWaveform()
    setAudioUrl(null)
    setDuration(null)
    setIsPlaying(false)
    leadingSilenceRef.current = 0
    chunksRef.current = []
    
    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, preferredRecorderOptions())
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mediaRecorder.onstop = () => {
        finalizeRecording()
      }
      mediaRecorder.onerror = (e) => {
        setError(e.error?.message || 'Recording error')
        setIsRecording(false)
        streamRef.current?.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      mediaRecorder.start()
      setIsRecording(true)
      // Auto stop at maxSeconds
      timerRef.current = window.setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
      }, maxSeconds * 1000)
    } catch (recordingError: unknown) {
      setError(errorMessage(recordingError, 'Recording failed'))
      setIsRecording(false)
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [finalizeRecording, maxSeconds])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const handleRecordClick = async () => {
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    
    // If microphone stream is not available, request access first
    if (!streamRef.current) {
      try {
        setError(null)
        setRequestingMic(true)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        const resumeRecording = micGranted
        setMicGranted(true)
        setShowMicSettings(false)
        setRequestingMic(false)
        // The first permission click remains permission-only. Once permission
        // is established, re-recording can begin with a single click.
        if (resumeRecording) await startRecording()
        return
      } catch (microphoneError: unknown) {
        setError(`Microphone access denied: ${errorMessage(microphoneError, 'Unknown error')}`)
        if (isDesktopApp()) {
          const status = await getDesktopMicrophoneStatus().catch(() => 'unknown' as const)
          setShowMicSettings(isTauriApp() || status === 'denied' || status === 'restricted')
        }
        setRequestingMic(false)
        return
      }
    }
    
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const togglePlayback = () => {
    if (!audioElRef.current) return
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if (audioElRef.current.paused) {
      // Start playback from the trimmed beginning
      audioElRef.current.currentTime = leadingSilenceRef.current
      audioElRef.current.play().catch((e) => {
        console.error('Playback failed:', e)
        setError('Playback failed. It might be blocked by the browser. Please try interacting with the page again.')
      })
      startRAF()
    } else {
      audioElRef.current.pause()
    }
  }

  const startRAF = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const step = () => {
      if (audioElRef.current && !audioElRef.current.paused && duration != null) {
        const effectiveTime = Math.max(0, audioElRef.current.currentTime - leadingSilenceRef.current)
        const progress = duration > 0 ? effectiveTime / duration : 0
        updatePlayhead(Math.min(1, Math.max(0, progress)))
        rafRef.current = requestAnimationFrame(step)
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  // Resize handling
  useEffect(() => {
    const onResize = () => drawWaveform()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [drawWaveform])

  return (
    <div className="space-y-4">
      <div className="relative flex flex-col items-center gap-3 lg:flex-row lg:items-center lg:gap-4 lg:min-h-[4rem]">
        <div className="flex w-full flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 lg:w-auto lg:flex-row lg:justify-start">
          {/* Circular microphone button */}
          <button
            type="button"
            onClick={handleRecordClick}
            disabled={requestingMic}
            className={`relative flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-medium text-white transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
              isRecording
                ? 'red-glow-record-button'
                : !micGranted
                ? 'yellow-glow-button'
                : 'green-glow-record-button'
            }`}
            aria-pressed={isRecording}
            aria-label={requestingMic ? 'Requesting microphone...' : isRecording ? 'Stop recording' : !micGranted ? 'Grant microphone permission' : audioUrl ? 'Re-record' : 'Record'}
          >
            {/* Microphone SVG icon */}
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg">
              <path d="M 69.245 38.312 c -1.104 0 -2 0.896 -2 2 v 6.505 c 0 12.266 -9.979 22.244 -22.245 22.244 s -22.245 -9.979 -22.245 -22.244 v -6.505 c 0 -1.104 -0.896 -2 -2 -2 s -2 0.896 -2 2 v 6.505 c 0 13.797 10.705 25.134 24.245 26.16 V 86 h -9.126 c -1.104 0 -2 0.896 -2 2 s 0.896 2 2 2 h 22.252 c 1.104 0 2 -0.896 2 -2 s -0.896 -2 -2 -2 H 47 V 72.978 c 13.54 -1.026 24.245 -12.363 24.245 -26.16 v -6.505 C 71.245 39.208 70.35 38.312 69.245 38.312 z"/>
              <path d="M 45 59.809 c 8.481 0 15.382 -6.9 15.382 -15.382 V 15.382 C 60.382 6.9 53.481 0 45 0 S 29.618 6.9 29.618 15.382 v 29.044 C 29.618 52.908 36.519 59.809 45 59.809 z M 33.618 15.382 C 33.618 9.106 38.724 4 45 4 c 6.276 0 11.382 5.106 11.382 11.382 v 29.044 c 0 6.276 -5.105 11.382 -11.382 11.382 c -6.276 0 -11.382 -5.106 -11.382 -11.382 V 15.382 z"/>
            </svg>
          </button>

          {/* Text label next to button */}
          <div className="flex flex-col items-center sm:items-start gap-1 text-center sm:text-left">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {requestingMic ? 'Requesting mic...' : isRecording ? 'Recording...' : !micGranted ? 'Grant microphone permission' : audioUrl ? 'Re-record' : 'Record'}
            </p>
            {duration && (
              <span className="text-xs text-slate-500 dark:text-slate-400">{duration.toFixed(2)}s</span>
            )}
          </div>

          {/* Play button next to text */}
          {audioUrl && ready && (
            <button
              type="button"
              onClick={togglePlayback}
              className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border-2 text-white hover:opacity-80 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
              style={{ 
                borderColor: 'rgb(143, 177, 120)', 
                backgroundColor: 'rgb(143, 177, 120)',
                color: 'white'
              }}
              aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            >
              {isPlaying ? (
                /* Pause icon */
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                /* Play icon */
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: '1px' }}>
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
          )}
        </div>

        {centerContent && (
          <>
            <div className="lg:hidden flex w-full flex-col items-center gap-1 text-center px-2">
              {centerContent}
            </div>
            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 max-w-[640px] flex-col items-center px-2 text-center lg:flex">
              {centerContent}
            </div>
          </>
        )}
        {extraButton && (
          <div className="flex w-full justify-center lg:ml-auto lg:w-auto lg:justify-end">
            {extraButton}
          </div>
        )}
      </div>

      {/* Waveform container with floating play button */}
      <div
        ref={waveformContainerRef}
        className={`relative w-full overflow-hidden rounded-md border border-slate-900 dark:border-slate-900 bg-transparent`}
        style={{height: 120}}
      >
        {(!audioUrl && !isRecording) && (
          <p className="select-none text-center text-xs text-slate-500 dark:text-slate-400 pt-12">
            Ready to record (max {maxSeconds}s)
          </p>
        )}
        {isRecording && (
          <div className="flex flex-col items-center gap-1 text-center text-xs text-red-600 dark:text-red-400 pt-8">
            <div className="h-3 w-3 animate-fast-blink rounded-full bg-red-600 dark:bg-red-400" />
            <p>Recording… (max {maxSeconds}s)</p>
          </div>
        )}
        <canvas ref={canvasRef} className={`absolute left-0 top-0 h-full w-full ${ready && audioUrl ? 'opacity-100' : 'opacity-0 transition-opacity'} pointer-events-none`} />
        {audioUrl && ready && (
          <div ref={playheadRef} className="pointer-events-none absolute top-0 h-full w-px bg-green-600" />
        )}
      </div>
      {error && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-red-600">
          <p>{error}</p>
          {showMicSettings && (
            <button
              type="button"
              className="rounded border border-red-500 px-2 py-1 font-medium hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => void openDesktopMicrophoneSettings()}
            >
              Open microphone settings
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default Recorder
