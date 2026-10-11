/**
 * Utilities for unpacking 2-channel stereo WAV audio files into separate mono WAV blobs.
 */

function encodeMonoWav(samples: Float32Array, sampleRate: number): Blob {
  const byteRate = sampleRate * 2; // 16-bit mono = 2 bytes per sample
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, "RIFF");
  // RIFF chunk length (36 + dataSize)
  view.setUint32(4, 36 + dataSize, true);
  // RIFF type
  writeString(view, 8, "WAVE");
  // format chunk identifier
  writeString(view, 12, "fmt ");
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw PCM = 1)
  view.setUint16(20, 1, true);
  // channel count (1 = mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sampleRate * numChannels * bitsPerSample/8)
  view.setUint32(28, byteRate, true);
  // block align (numChannels * bitsPerSample/8)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, "data");
  // data chunk length
  view.setUint32(40, dataSize, true);

  // Write PCM16 samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, val, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export interface UnpackedStereoAudio {
  callerBlobUrl: string;
  gnomeBlobUrl: string;
  durationSeconds: number;
}

/**
 * Unpacks a 2-channel stereo WAV ArrayBuffer into two independent mono WAV object URLs:
 * - Channel 0 (Left): Caller / Scammer audio
 * - Channel 1 (Right): Gnome audio
 */
export async function unpackStereoWav(arrayBuffer: ArrayBuffer): Promise<UnpackedStereoAudio> {
  // Use AudioContext to decode the WAV container
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  
  if (!AudioCtx) {
    throw new Error("Web Audio API not supported in this browser");
  }

  const tempCtx = new AudioCtx();
  try {
    // decodeAudioData consumes the arrayBuffer, so slice a copy
    const bufferCopy = arrayBuffer.slice(0);
    const audioBuffer = await tempCtx.decodeAudioData(bufferCopy);
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    const numChannels = audioBuffer.numberOfChannels;
    let callerData: Float32Array;
    let gnomeData: Float32Array;

    if (numChannels >= 2) {
      callerData = audioBuffer.getChannelData(0);
      gnomeData = audioBuffer.getChannelData(1);
    } else {
      // If the audio only had 1 channel, copy to both
      callerData = audioBuffer.getChannelData(0);
      gnomeData = audioBuffer.getChannelData(0);
    }

    const callerBlob = encodeMonoWav(callerData, sampleRate);
    const gnomeBlob = encodeMonoWav(gnomeData, sampleRate);

    const callerBlobUrl = URL.createObjectURL(callerBlob);
    const gnomeBlobUrl = URL.createObjectURL(gnomeBlob);

    return {
      callerBlobUrl,
      gnomeBlobUrl,
      durationSeconds: duration,
    };
  } finally {
    if (tempCtx.state !== "closed") {
      tempCtx.close().catch(() => {});
    }
  }
}

