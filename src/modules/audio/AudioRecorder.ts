import EventEmitter from 'eventemitter3';

export class AudioRecorder extends EventEmitter {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private isRecording: boolean = false;

  // Gemini often expects 16kHz or 24kHz. 
  // We will resample to targetSampleRate.
  private readonly targetSampleRate = 16000;

  constructor() {
    super();
  }

  async start() {
    if (this.isRecording) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create AudioContext
      this.audioContext = new AudioContext({ sampleRate: this.targetSampleRate });

      // Load AudioWorklet
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');

      // Create Source
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create Worklet Node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

      // Handle messages from worklet
      this.workletNode.port.onmessage = (event) => {
        const { type, buffer } = event.data;

        if (type === 'speech_start') {
          this.emit('speech_start');
        } else if (type === 'speech_end') {
          this.emit('speech_end');
        } else if (type === 'audio_data') {
          this.processAudioData(buffer);
        }
      };

      // Connect graph
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination); // Necessary for processing to happen? 
      // Actually, connecting to destination might cause feedback if not careful, 
      // but for Worklet it's often needed to keep the graph alive. 
      // However, usually we don't want to hear ourselves. 
      // Let's try NOT connecting to destination first, or connect to a mute gain.
      // If the worklet returns true in process(), it should keep running.
      // But some browsers require connection to destination. 
      // Let's connect to destination but mute it if needed, or just rely on the fact that 
      // we are not outputting anything in process() to the output channels if we don't want to hear it.
      // In my audio-processor.js, I didn't write to outputs. So it should be fine.

      this.isRecording = true;
      console.log('AudioRecorder started');

    } catch (error) {
      console.error('Error starting AudioRecorder:', error);
      throw error;
    }
  }

  stop() {
    if (!this.isRecording) return;

    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();

    this.sourceNode = null;
    this.workletNode = null;
    this.mediaStream = null;
    this.audioContext = null;
    this.isRecording = false;
    console.log('AudioRecorder stopped');
  }

  private processAudioData(float32Buffer: Float32Array) {
    // Convert Float32 to Int16 PCM
    const pcmData = this.floatTo16BitPCM(float32Buffer);

    // Convert to Base64
    const base64Audio = this.arrayBufferToBase64(pcmData.buffer);

    this.emit('audio_data', base64Audio);
  }

  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  private arrayBufferToBase64(buffer: ArrayBufferLike): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
