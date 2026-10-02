import { Mp3Encoder } from "@breezystack/lamejs";

const SAMPLE_RATE = 24000;
const KBPS = 64;

/**
 * Joins MP3 clips (any voice / sample rate) into one MP3 with silence between them.
 * Runs in the browser: decode → place on one mono timeline → encode.
 */
export async function buildPlaylistMp3(clips: ArrayBuffer[], pauseSeconds: number): Promise<Blob> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer[];
  try {
    // decodeAudioData detaches its input, so give it a copy.
    decoded = await Promise.all(clips.map((c) => ctx.decodeAudioData(c.slice(0))));
  } finally {
    void ctx.close();
  }

  const totalSeconds = decoded.reduce((sum, b) => sum + b.duration + pauseSeconds, 0);
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(totalSeconds * SAMPLE_RATE)), SAMPLE_RATE);
  let at = 0;
  for (const buffer of decoded) {
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start(at);
    at += buffer.duration + pauseSeconds;
  }
  const pcm = (await offline.startRendering()).getChannelData(0);
  return encodeMp3(pcm, SAMPLE_RATE);
}

export function encodeMp3(samples: Float32Array, sampleRate: number): Blob {
  const encoder = new Mp3Encoder(1, sampleRate, KBPS);
  const parts: Uint8Array[] = [];
  const FRAME = 1152;
  const chunk = new Int16Array(FRAME);
  for (let i = 0; i < samples.length; i += FRAME) {
    const n = Math.min(FRAME, samples.length - i);
    for (let j = 0; j < n; j++) {
      const s = Math.max(-1, Math.min(1, samples[i + j]));
      chunk[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const out = encoder.encodeBuffer(n === FRAME ? chunk : chunk.subarray(0, n));
    if (out.length) parts.push(out.slice());
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(tail.slice());
  return new Blob(parts as BlobPart[], { type: "audio/mpeg" });
}
