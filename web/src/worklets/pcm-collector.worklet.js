class PcmCollector extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input[0]) {
      const ch0 = input[0]
      const copy = new Float32Array(ch0.length)
      copy.set(ch0)
      this.port.postMessage(copy)
    }
    return true
  }
}

registerProcessor('pcm-collector', PcmCollector)


