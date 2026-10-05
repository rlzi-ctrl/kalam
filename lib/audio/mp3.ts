// Browser-only: a recording (webm/opus, mp4/aac, wav ...) → mono MP3 small enough to upload and play anywhere.
import { encodeMp3 } from "@/lib/client/playlist";

const SAMPLE_RATE = 24000;

export async function recordingToMp3(recording: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await recording.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return encodeMp3((await offline.startRendering()).getChannelData(0), SAMPLE_RATE);
}
