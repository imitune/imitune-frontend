import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Recording } from '../lib/audio/recorder'

type Props = {
  onRecorded?: (rec: Recording) => void
  maxSeconds?: number
  extraButton?: React.ReactNode
  showRedGlow?: boolean
}

// Single record button component with post-record waveform + playback controls.
// Press record -> captures up to maxSeconds (default 10) or until stopped.
// After recording, waveform + play/pause shown. Press record again to discard and start fresh.
const Recorder: React.FC<Props> = ({ onRecorded, maxSeconds = 10, extraButton, showRedGlow = false }) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [micReady, setMicReady] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<number | null>(null)
  const waveformContainerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playheadRef = useRef<HTMLDivElement | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
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
    // Request microphone access on component mount
    const initMicrophone = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        setMicReady(true)
        setError(null)
      } catch (e: any) {
        setError(`Microphone access denied: ${e?.message || 'Unknown error'}`)
        setMicReady(false)
      }
    }
    
    initMicrophone()
    
    return () => {
      // component unmount cleanup
      clearTimer()
      destroyWaveform()
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop() } catch {}
      }
    }
  }, [])

  const finalizeRecording = useCallback(async () => {
    setIsRecording(false)
    clearTimer()
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    chunksRef.current = []
    const url = URL.createObjectURL(blob)
    objectUrlRef.current = url
    setAudioUrl(url)
    try {
      // Get sample rate + channels
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const arrayBuf = await blob.arrayBuffer()
      const audioBuf = await audioCtx.decodeAudioData(arrayBuf)
      // Store the audio buffer for waveform processing
      audioBufferRef.current = audioBuf
      const rec: Recording = { blob, url, sampleRate: audioBuf.sampleRate, numChannels: audioBuf.numberOfChannels }
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
      drawWaveform()
    } catch (e) {
      // Non-fatal if decode fails
      setError('Failed to decode audio metadata')
    }

    // Keep stream alive for next recording - don't release tracks
    mediaRecorderRef.current = null
  }, [onRecorded])

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
      const mediaRecorder = new MediaRecorder(streamRef.current)
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
      }
      mediaRecorder.start()
      setIsRecording(true)
      // Auto stop at maxSeconds
      timerRef.current = window.setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
      }, maxSeconds * 1000)
    } catch (e: any) {
      setError(e?.message || 'Recording failed')
      setIsRecording(false)
    }
  }, [finalizeRecording, maxSeconds])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const handleRecordClick = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const togglePlayback = () => {
    if (!audioElRef.current) return
    if (audioElRef.current.paused) {
      // Start playback from the trimmed beginning
      audioElRef.current.currentTime = leadingSilenceRef.current
      audioElRef.current.play().catch(() => {})
      startRAF()
    } else {
      audioElRef.current.pause()
    }
  }

  const updatePlayhead = (progress: number) => {
    if (!playheadRef.current) return
    playheadRef.current.style.left = `${(progress * 100).toFixed(4)}%`
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
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()
      
      // Draw horizontal reference line in the middle (same as the flat line in this case)
      ctx.strokeStyle = '#334155' // same color as waveform
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
    ctx.strokeStyle = '#334155'
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
    ctx.strokeStyle = '#334155' // same color as waveform
    ctx.lineWidth = 0.5 // thinner than waveform
    ctx.beginPath()
    ctx.moveTo(0, midY)
    ctx.lineTo(width, midY)
    ctx.stroke()
    
    setReady(true)
    updatePlayhead(0)
  }, [setReady])

  // Resize handling
  useEffect(() => {
    const onResize = () => drawWaveform()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [drawWaveform])

  const mixToMono = (buf: AudioBuffer) => {
    const chData = [] as Float32Array[]
    for (let c = 0; c < buf.numberOfChannels; c++) chData.push(buf.getChannelData(c))
    const out = new Float32Array(buf.length)
    for (let i = 0; i < buf.length; i++) {
      let sum = 0
      for (let c = 0; c < chData.length; c++) sum += chData[c][i]
      out[i] = sum / chData.length
    }
    return out
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
              onClick={handleRecordClick}
              disabled={!micReady}
              className={`${showRedGlow && !audioUrl ? 'red-glow-on-start red-glow-active' : ''} relative rounded-full px-6 py-3 font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${isRecording ? 'bg-red-600 hover:bg-red-500 focus:ring-red-600' : 'bg-slate-900 hover:bg-slate-800 focus:ring-slate-900'}`}
              aria-pressed={isRecording}
          >
            {!micReady ? 'Requesting mic...' : isRecording ? 'Stop' : audioUrl ? 'Re-record' : 'Record'}
          </button>
          {audioUrl && (
            <button
              type="button"
              onClick={togglePlayback}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          )}
          {duration && (
            <span className="text-xs text-slate-500">{duration.toFixed(2)}s</span>
          )}
        </div>
        {extraButton && <div>{extraButton}</div>}
      </div>
      <div
        ref={waveformContainerRef}
        className={`relative w-full overflow-hidden rounded-md border border-dashed ${audioUrl ? 'border-slate-300' : 'border-slate-200'} bg-slate-50`}
        style={{height: 120}}
      >
        {(!audioUrl && !isRecording) && (
          <p className="select-none text-center text-xs text-slate-500 pt-8">
            {micReady ? `Ready to record (max ${maxSeconds}s)` : 'Requesting microphone access...'}
          </p>
        )}
        {isRecording && (
          <div className="flex flex-col items-center gap-1 text-center text-xs text-red-600 pt-8">
            <div className="h-3 w-3 animate-fast-blink rounded-full bg-red-600" />
            <p>Recording… (max {maxSeconds}s)</p>
          </div>
        )}
        <canvas ref={canvasRef} className={`absolute left-0 top-0 h-full w-full ${ready && audioUrl ? 'opacity-100' : 'opacity-0 transition-opacity'} pointer-events-none`} />
        {audioUrl && ready && (
          <div ref={playheadRef} className="pointer-events-none absolute top-0 h-full w-px bg-red-600 shadow-[0_0_2px_rgba(220,38,38,0.8)]" />
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export default Recorder
