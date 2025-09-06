export type Recording = {
  blob: Blob
  url: string
  sampleRate: number
  numChannels: number
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
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
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

