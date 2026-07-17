import * as ort from 'onnxruntime-web'
import { isDesktopApp } from '../desktop/runtime'

// Configure ONNX Runtime WASM paths
// Use CDN for web (Vite dev server can't serve dynamic imports from public/)
// Use local files for Tauri (the packaged app bundles them in the onnx/ directory).
ort.env.wasm.wasmPaths = isDesktopApp()
  ? './onnx/'
  : 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/'
// Disable multithreading for compatibility
ort.env.wasm.numThreads = 1

export type EmbeddingResult = {
  vector: Float32Array
}

export type InferenceConfig = {
  modelUrl: string
}

export async function loadSession(modelUrl: string) {
  try {
    const response = await fetch(modelUrl)
    const arrayBuffer = await response.arrayBuffer()
    
    const session = await ort.InferenceSession.create(arrayBuffer, {
      executionProviders: ['wasm']
    })
    return session
  } catch (error) {
    console.error('Session creation error:', error)
    // Try fallback with CPU provider
    try {
      const response = await fetch(modelUrl)
      const arrayBuffer = await response.arrayBuffer()
      const session = await ort.InferenceSession.create(arrayBuffer, {
        executionProviders: ['cpu']
      })
      return session
    } catch (fallbackError) {
      console.error('CPU fallback failed:', fallbackError)
      throw fallbackError
    }
  }
}

export async function audioBlobToMonoFloat32(blob: Blob, targetSampleRate: number = 32000): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextConstructor) throw new Error('Web Audio is not supported in this environment.')
  const audioCtx = new AudioContextConstructor()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  
  // Use Web Audio API for proper resampling with anti-aliasing
  let processedAudio: Float32Array
  if (audioBuffer.sampleRate !== targetSampleRate) {
    processedAudio = await resampleAudioBuffer(audioBuffer, targetSampleRate)
  } else {
    // Still need to convert to mono if sample rates match
    processedAudio = convertToMono(audioBuffer)
  }
  
  // Zero-pad to 10 seconds at target sample rate
  const targetLength = Math.round(targetSampleRate * 10)
  if (processedAudio.length < targetLength) {
    const padded = new Float32Array(targetLength)
    padded.set(processedAudio)
    return padded
  }
  
  return processedAudio
}

// Convert multi-channel audio buffer to mono
function convertToMono(audioBuffer: AudioBuffer): Float32Array {
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

// Resample audio buffer using Web Audio API with proper anti-aliasing
async function resampleAudioBuffer(audioBuffer: AudioBuffer, targetSampleRate: number): Promise<Float32Array> {
  // First convert to mono at original sample rate
  const monoData = convertToMono(audioBuffer)
  
  // Calculate target length maintaining the same duration
  const duration = audioBuffer.duration
  const targetLength = Math.round(targetSampleRate * duration)
  
  // Create offline context with target sample rate
  const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate)
  
  // Create a mono buffer at the original sample rate
  const monoBuffer = offlineCtx.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate)
  const channelData = monoBuffer.getChannelData(0)
  channelData.set(monoData)
  
  // Create source and connect to destination
  const source = offlineCtx.createBufferSource()
  source.buffer = monoBuffer
  source.connect(offlineCtx.destination)
  source.start(0)
  
  // Render with proper resampling
  const resampledBuffer = await offlineCtx.startRendering()
  return resampledBuffer.getChannelData(0)
}

export async function runEmbedding(
  session: ort.InferenceSession,
  audio: Float32Array,
): Promise<EmbeddingResult> {
  // Model expects input: { waveform: float32 [batch_size, samples] }
  // Output: { embedding: float32 [batch_size, embedding_dim] }
  console.log('Creating tensor with shape: [1,', audio.length, '] (batch_size=1)')
  const audioTensor = new ort.Tensor('float32', audio, [1, audio.length])
  const feeds: Record<string, ort.Tensor> = {
    waveform: audioTensor,
  }
  console.log('Running inference with feeds:', Object.keys(feeds))
  const output = await session.run(feeds)
  console.log('Inference complete, output keys:', Object.keys(output))
  const embeddingTensor = output.embedding
  const vector = embeddingTensor.data as Float32Array
  console.log('Embedding extracted, vector length:', vector.length)
  return { vector }
}
