export function createBlob(data: Float32Array): { mimeType: string; data: string } {
	const buffer = new ArrayBuffer(data.length * 2);
	const view = new DataView(buffer);
	for (let i = 0; i < data.length; i++) {
		const s = Math.max(-1, Math.min(1, data[i]));
		view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
	}
	const base64 = btoa(
		new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
	);
	return { mimeType: 'audio/pcm;rate=16000', data: base64 };
}

export function decode(base64: string): ArrayBuffer {
	const binaryString = atob(base64);
	const len = binaryString.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

export async function decodeAudioData(
	audioData: ArrayBuffer,
	audioContext: AudioContext,
	sampleRate: number,
	channels: number
): Promise<AudioBuffer> {
	// PCM 24kHz 1ch (Int16) -> Float32 conversion
	const int16Data = new Int16Array(audioData);
	const float32Data = new Float32Array(int16Data.length);

	for (let i = 0; i < int16Data.length; i++) {
		// Convert Int16 to Float32 (-1.0 to 1.0)
		float32Data[i] = int16Data[i] / 32768.0;
	}

	const audioBuffer = audioContext.createBuffer(channels, float32Data.length, sampleRate);
	audioBuffer.getChannelData(0).set(float32Data);
	return audioBuffer;
}
