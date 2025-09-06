import * as ort from 'onnxruntime-web'

export type EmbeddingResult = {
  vector: Float32Array
}

export type InferenceConfig = {
  modelUrl: string
}

export async function loadSession(modelUrl: string) {
  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
  return session
}

export async function audioBlobToMonoFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  // downmix to mono
  const numChannels = audioBuffer.numberOfChannels
  const length = audioBuffer.length
  const mono = new Float32Array(length)
  for (let ch = 0; ch < numChannels; ch++) {
    const data = audioBuffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / numChannels
    }
  }
  return mono
}

export async function runEmbedding(
  session: ort.InferenceSession,
  audio: Float32Array,
  sampleRate: number,
): Promise<EmbeddingResult> {
  // Assumes model expects inputs: { audio: float32 [T], sample_rate: int64 [1] }
  // Adjust names/shapes to your model
  const audioTensor = new ort.Tensor('float32', audio, [audio.length])
  const srTensor = new ort.Tensor('int64', BigInt(sampleRate))
  const feeds: Record<string, ort.Tensor> = {
    audio: audioTensor,
    sample_rate: srTensor,
  }
  const output = await session.run(feeds)
  const first = Object.values(output)[0]
  const vector = first.data as Float32Array
  return { vector }
}

