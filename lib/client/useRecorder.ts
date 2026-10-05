"use client";

import { useRef, useState } from "react";
import { toWav16kMono } from "@/lib/audio/wav";

export type RecState = "idle" | "recording" | "processing";
/** wav: 16 kHz mono for STT; raw: what the browser recorded (better quality, e.g. for reviewer audio). */
export type Recording = { wav: Blob; seconds: number; raw: Blob };

/** Mic → 16 kHz mono WAV, auto-stopping at maxSeconds. */
export function useRecorder(maxSeconds: number) {
  const [rec, setRec] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopTimer = () => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  /** Resolves false if the mic could not be opened. onDone runs once the WAV is ready. */
  const start = async (onDone: (r: Recording) => void | Promise<void>): Promise<boolean> => {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setError(`Microphone unavailable: ${String(err)}`);
      return false;
    }
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      stopTimer();
      stream.getTracks().forEach((t) => t.stop());
      setRec("processing");
      let recording: Recording;
      const raw = new Blob(chunks, { type: recorder.mimeType });
      try {
        recording = { ...(await toWav16kMono(raw)), raw };
      } catch (err) {
        setError(`Could not process recording: ${String(err)}`);
        setRec("idle");
        return;
      }
      setRec("idle");
      await onDone(recording);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRec("recording");
    setElapsed(0);
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const s = (Date.now() - started) / 1000;
      setElapsed(s);
      if (s >= maxSeconds && recorder.state === "recording") recorder.stop();
    }, 200);
    return true;
  };

  const stop = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  return { rec, elapsed, error, start, stop, remaining: Math.max(0, Math.ceil(maxSeconds - elapsed)) };
}
