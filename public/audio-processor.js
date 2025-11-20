class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.isSpeaking = false;
    this.silenceThreshold = 0.01; // Adjust this value based on microphone sensitivity
    this.silenceCounter = 0;
    this.silenceLimit = 20; // Number of buffers to wait before declaring silence
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    const channelData = input[0];

    // 1. Calculate RMS for VAD
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / channelData.length);

    // 2. VAD Logic
    if (rms > this.silenceThreshold) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.port.postMessage({ type: 'speech_start' });
      }
      this.silenceCounter = 0;
    } else {
      if (this.isSpeaking) {
        this.silenceCounter++;
        if (this.silenceCounter > this.silenceLimit) {
          this.isSpeaking = false;
          this.port.postMessage({ type: 'speech_end' });
        }
      }
    }

    // 3. Buffer and send data
    // We want to send data frequently enough for low latency
    // Gemini supports 16kHz or 24kHz. The context is likely 44.1 or 48kHz.
    // We will just pass the raw float data to the main thread for resampling/encoding
    // to keep the worklet simple, or we can do simple downsampling here if needed.
    // For simplicity, let's send chunks to main thread.

    // Copy to internal buffer
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];
      if (this.bufferIndex >= this.bufferSize) {
        this.flush();
      }
    }

    return true;
  }

  flush() {
    // Send copy of buffer
    this.port.postMessage({
      type: 'audio_data',
      buffer: this.buffer.slice(0, this.bufferIndex)
    });
    this.bufferIndex = 0;
  }
}

registerProcessor('audio-processor', AudioProcessor);
