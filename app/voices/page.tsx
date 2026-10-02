"use client";

import { useEffect, useRef, useState } from "react";
import { Nav } from "@/components/Nav";
import { PasscodeScreen } from "@/components/PasscodeScreen";
import type { Card } from "@/lib/cards";
import { VOICE_KEY, readStored, writeStored } from "@/lib/client/prefs";
import { useAppApi } from "@/lib/client/useAppApi";
import { useTts } from "@/lib/client/useTts";

const DEFAULT_SENTENCE = "Their car is very old, but his car is new and expensive.";

type Sample = Pick<Card, "english" | "translit" | "arabic" | "tts_spelling">;
type VoiceRun = { status: "loading" } | { status: "done"; cache: string; ms: number } | { status: "error"; error: string };

/** One sentence, every voice: for the tutor to pick the most natural Levantine voice. */
export default function VoicesPage() {
  const { api, meta, loadError, needPasscode, passcodeTried, submitPasscode } = useAppApi();
  const getSpeech = useTts(api);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [english, setEnglish] = useState(DEFAULT_SENTENCE);
  const [sample, setSample] = useState<Sample | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<Record<string, VoiceRun>>({});
  const [playing, setPlaying] = useState("");
  const [slow, setSlow] = useState(false);
  const [chosen, setChosen] = useState("");
  const [saved, setSaved] = useState<Card[]>([]);

  useEffect(() => setChosen(readStored(VOICE_KEY)), []);

  useEffect(() => {
    if (!meta?.storageConfigured) return;
    api("/api/cards")
      .then((r) => r.json())
      .then((j) => setSaved(j.cards ?? []))
      .catch(() => {});
  }, [meta, api]);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api("/api/say", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ english, save: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSample(json.card);
      setRuns({});
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  const pickSaved = (id: string) => {
    const card = saved.find((c) => c.id === id);
    if (card) {
      setSample(card);
      setEnglish(card.english);
      setRuns({});
    }
  };

  const play = async (voiceId: string) => {
    if (!sample) return;
    const audio = (audioRef.current ??= new Audio());
    audio.pause();
    setPlaying(voiceId);
    setRuns((r) => ({ ...r, [voiceId]: { status: "loading" } }));
    try {
      const clip = await getSpeech(voiceId, sample.tts_spelling);
      setRuns((r) => ({ ...r, [voiceId]: { status: "done", cache: clip.cache, ms: clip.ms } }));
      audio.src = clip.url;
      audio.playbackRate = slow ? 0.75 : 1;
      audio.onended = () => setPlaying("");
      await audio.play();
    } catch (err) {
      setRuns((r) => ({ ...r, [voiceId]: { status: "error", error: String(err instanceof Error ? err.message : err) } }));
      setPlaying("");
    }
  };

  const choose = (voiceId: string) => {
    setChosen(voiceId);
    writeStored(VOICE_KEY, voiceId);
  };

  if (needPasscode) return <PasscodeScreen tried={passcodeTried} onSubmit={submitPasscode} />;

  return (
    <main className="container">
      <Nav />
      <h1>Voice test</h1>
      <p className="muted small">Play one sentence in every voice and pick the one that sounds most natural. The choice is saved on this device and used by Say it and the playlist.</p>
      {loadError && <p className="warn">{loadError}</p>}

      <form className="card say-form" onSubmit={generate}>
        <label htmlFor="en">Test sentence (English)</label>
        <textarea id="en" rows={2} value={english} onChange={(e) => setEnglish(e.target.value)} />
        <button className="btn primary" disabled={busy || !english.trim() || !meta?.grader.configured}>
          {busy ? "Translating…" : "Translate"}
        </button>
        {saved.length > 0 && (
          <label className="small">
            or use a saved sentence{" "}
            <select value="" onChange={(e) => pickSaved(e.target.value)}>
              <option value="">—</option>
              {saved.map((c) => (
                <option key={c.id} value={c.id}>{c.english}</option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="warn">{error}</p>}
      </form>

      {sample && (
        <section className="card sentence">
          <p className="translit-big">{sample.translit}</p>
          <p className="arabic-big" dir="rtl" lang="ar">{sample.arabic}</p>
          <p className="small muted">
            Sent to TTS: <span dir="rtl" lang="ar" className="tts-spelling">{sample.tts_spelling}</span>
          </p>
          <button className={`seg ${slow ? "on" : ""}`} aria-pressed={slow} onClick={() => setSlow((v) => !v)}>0.75×</button>
        </section>
      )}

      <section className="voice-list">
        {meta?.voices.map((v) => {
          const run = runs[v.id];
          return (
            <article key={v.id} className={`card voice ${v.configured ? "" : "unconfigured"} ${chosen === v.id ? "chosen" : ""}`}>
              <h2>{v.label}</h2>
              {!v.configured ? (
                <p className="muted small">Not configured (set {v.missing.join(", ")})</p>
              ) : (
                <div className="voice-actions">
                  <button className="btn primary" onClick={() => play(v.id)} disabled={!sample || run?.status === "loading"}>
                    {playing === v.id && run?.status !== "error" ? "Playing…" : "▶ Play"}
                  </button>
                  <button className={`seg ${chosen === v.id ? "on" : ""}`} onClick={() => choose(v.id)}>
                    {chosen === v.id ? "✓ Chosen" : "Use this voice"}
                  </button>
                </div>
              )}
              {run?.status === "done" && (
                <p className="muted small">{run.cache === "hit" ? "from cache" : `generated in ${run.ms} ms`}</p>
              )}
              {run?.status === "error" && <p className="warn small">{run.error}</p>}
            </article>
          );
        })}
      </section>
      {meta && !meta.voices.some((v) => v.provider === "elevenlabs") && (
        <p className="muted small">
          No ElevenLabs voices listed: add Levantine-accent voices from the ElevenLabs Voice Library to your account, then set
          ELEVENLABS_TTS_VOICES (e.g. Rania=voiceId,Fares=voiceId).
        </p>
      )}
    </main>
  );
}
