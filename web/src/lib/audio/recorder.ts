export type Recording = {
  blob: Blob
  url: string
  sampleRate: number
  numChannels: number
}

export function audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const sampleRate = audioBuffer.sampleRate
  const sampleCount = audioBuffer.length
  const mono = new Float32Array(sampleCount)

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const samples = audioBuffer.getChannelData(channel)
    for (let index = 0; index < sampleCount; index += 1) {
      mono[index] += samples[index] / audioBuffer.numberOfChannels
    }
  }

  const bytesPerSample = 2
  const dataLength = sampleCount * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataLength, true)

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.max(-1, Math.min(1, mono[index]))
    view.setInt16(44 + index * bytesPerSample, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export async function recordUpToSeconds(maxSeconds: number = 10): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mediaRecorder = new MediaRecorder(stream)
  const chunks: BlobPart[] = []

  return new Promise<Recording>((resolve, reject) => {
    const onData = (e: BlobEvent) => chunks.push(e.data)
    const onStop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      const url = URL.createObjectURL(blob)
      // best-effort sample rate via AudioContext
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
      if (!AudioContextConstructor) throw new Error('Web Audio is not supported in this environment.')
      const audioCtx = new AudioContextConstructor()
      const arrayBuf = await blob.arrayBuffer()
      const audioBuf = await audioCtx.decodeAudioData(arrayBuf)
      resolve({ blob, url, sampleRate: audioBuf.sampleRate, numChannels: audioBuf.numberOfChannels })
      stream.getTracks().forEach((t) => t.stop())
      mediaRecorder.removeEventListener('dataavailable', onData)
      mediaRecorder.removeEventListener('stop', onStop)
    }
    mediaRecorder.addEventListener('dataavailable', onData)
    mediaRecorder.addEventListener('stop', onStop)
    mediaRecorder.addEventListener('error', (e) => reject(e))

    mediaRecorder.start()
    setTimeout(() => {
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    }, maxSeconds * 1000)
  })
}
