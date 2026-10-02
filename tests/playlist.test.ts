import { describe, expect, it } from "vitest";
import { encodeMp3 } from "@/lib/client/playlist";

describe("encodeMp3", () => {
  it("produces MPEG audio frames for one second of tone", async () => {
    const rate = 24000;
    const samples = Float32Array.from({ length: rate }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / rate));
    const mp3 = new Uint8Array(await encodeMp3(samples, rate).arrayBuffer());
    expect(mp3.length).toBeGreaterThan(4000); // ~64 kbps for 1 s ≈ 8 KB
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0); // frame sync
  });
});
