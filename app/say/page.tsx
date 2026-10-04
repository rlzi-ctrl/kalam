"use client";

import { useCallback, useEffect, useState } from "react";
import { ConsensusOptIn, useConsensusOptIn } from "@/components/ConsensusOptIn";
import { GradeCard } from "@/components/GradeCard";
import { ModelToggle, useModelChoice } from "@/components/ModelToggle";
import { Nav } from "@/components/Nav";
import { PasscodeScreen } from "@/components/PasscodeScreen";
import { Player } from "@/components/Player";
import type { Card } from "@/lib/cards";
import { buildPlaylistMp3 } from "@/lib/client/playlist";
import { VOICE_KEY, readStored, writeStored } from "@/lib/client/prefs";
import { postGrade, transcribeAll } from "@/lib/client/transcribe";
import { useAppApi } from "@/lib/client/useAppApi";
import { useRecorder } from "@/lib/client/useRecorder";
import { useTts } from "@/lib/client/useTts";
import { OPT_IN_VOTERS, selectForConsensus, type Discarded } from "@/lib/consensus";
import type { GradeDone } from "@/lib/results";

const MAX_SECONDS = 60;
const COUNTDOWN_FROM = 10;

type Attempt =
  | { status: "transcribing" }
  | { status: "grading"; used: string[]; discarded: Discarded[] }
  | { status: "done"; used: string[]; discarded: Discarded[]; grade: GradeDone }
  | { status: "error"; error: string; discarded: Discarded[] };

export default function SayPage() {
  const { api, meta, loadError, needPasscode, passcodeTried, submitPasscode } = useAppApi();
  const { model, choose, label: modelLabel } = useModelChoice(meta);
  const getSpeech = useTts(api);
  const recorder = useRecorder(MAX_SECONDS);
  const { optIn, toggle: toggleOptIn } = useConsensusOptIn();

  const [english, setEnglish] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [current, setCurrent] = useState<Card | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardsError, setCardsError] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [voiceId, setVoiceId] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [pause, setPause] = useState(3);
  const [playlistScope, setPlaylistScope] = useState<"all" | "starred">("all");
  const [playlist, setPlaylist] = useState<{ busy: boolean; progress: string; url?: string; error?: string }>({ busy: false, progress: "" });

  const voices = meta?.voices.filter((v) => v.configured) ?? [];

  useEffect(() => {
    if (!meta) return;
    const stored = readStored(VOICE_KEY);
    const usable = meta.voices.filter((v) => v.configured);
    setVoiceId(usable.some((v) => v.id === stored) ? stored : (usable[0]?.id ?? ""));
  }, [meta]);

  const loadCards = useCallback(async () => {
    try {
      const res = await api("/api/cards");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCards(json.cards);
      setCardsError("");
    } catch (err) {
      setCardsError(String(err instanceof Error ? err.message : err));
    }
  }, [api]);

  useEffect(() => {
    if (meta?.storageConfigured) void loadCards();
  }, [meta, loadCards]);

  const chooseVoice = (id: string) => {
    setVoiceId(id);
    writeStored(VOICE_KEY, id);
  };

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!english.trim()) return;
    setGenerating(true);
    setGenError("");
    try {
      const res = await api("/api/say", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ english, model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCurrent(json.card);
      setAttempt(null);
      setEnglish("");
      if (json.saved) setCards((cs) => [...cs, json.card]);
      else if (json.saveError) setGenError(`Generated, but not saved: ${json.saveError}`);
    } catch (err) {
      setGenError(String(err instanceof Error ? err.message : err));
    } finally {
      setGenerating(false);
    }
  };

  const setStar = async (card: Card, starred: boolean) => {
    const res = await api(`/api/cards/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred }),
    });
    const json = await res.json();
    if (!res.ok) return setCardsError(json.error ?? `HTTP ${res.status}`);
    setCards((cs) => cs.map((c) => (c.id === card.id ? json.card : c)));
    if (current?.id === card.id) setCurrent(json.card);
  };

  const removeCard = async (card: Card) => {
    if (!window.confirm(`Delete "${card.english}"?`)) return;
    const res = await api(`/api/cards/${card.id}`, { method: "DELETE" });
    if (!res.ok) return setCardsError(`Delete failed: HTTP ${res.status}`);
    setCards((cs) => cs.filter((c) => c.id !== card.id));
    if (current?.id === card.id) setCurrent(null);
  };

  const recordAttempt = async () => {
    if (!meta || !current) return;
    const card = current;
    setAttempt(null);
    await recorder.start(async ({ wav }) => {
      setAttempt({ status: "transcribing" });
      // Only providers that can vote; an opt-in provider that is switched off isn't called at all.
      const providers = meta.providers.filter(
        (p) => p.configured && p.inConsensus && (!OPT_IN_VOTERS.includes(p.id) || optIn.includes(p.id)),
      );
      const transcripts = await transcribeAll(api, providers, wav, () => {});
      const { used, discarded } = selectForConsensus(transcripts, { optIn });
      if (used.length === 0) {
        return setAttempt({ status: "error", error: "No usable transcripts to grade.", discarded });
      }
      setAttempt({ status: "grading", used: used.map((t) => t.label), discarded });
      try {
        const { ok, status, json } = await postGrade(api, {
          item: { en: card.english, translit: card.translit, arabic: card.arabic },
          mode: "consensus",
          model,
          transcripts,
          optIn,
        });
        if (!ok) throw new Error(json.error ?? `HTTP ${status}`);
        setAttempt({
          status: "done",
          used: used.map((t) => t.label),
          discarded,
          grade: { ...json, status: "done", requestedModel: model },
        });
      } catch (err) {
        setAttempt({ status: "error", error: String(err instanceof Error ? err.message : err), discarded });
      }
    });
  };

  const downloadPlaylist = async () => {
    const chosen = cards.filter((c) => playlistScope === "all" || c.starred);
    if (!voiceId || chosen.length === 0) return;
    setPlaylist({ busy: true, progress: `Fetching audio 0/${chosen.length}` });
    try {
      let done = 0;
      const clips = await Promise.all(
        chosen.map(async (c) => {
          const clip = await getSpeech(voiceId, c.tts_spelling);
          setPlaylist({ busy: true, progress: `Fetching audio ${++done}/${chosen.length}` });
          return clip.bytes;
        }),
      );
      setPlaylist({ busy: true, progress: "Building MP3…" });
      const mp3 = await buildPlaylistMp3(clips, pause);
      setPlaylist({ busy: false, progress: `${chosen.length} sentences, ${pause} s pauses`, url: URL.createObjectURL(mp3) });
    } catch (err) {
      setPlaylist({ busy: false, progress: "", error: String(err instanceof Error ? err.message : err) });
    }
  };

  if (needPasscode) return <PasscodeScreen tried={passcodeTried} onSubmit={submitPasscode} />;

  const shown = cards.filter((c) => !starredOnly || c.starred).slice().reverse();
  const counting = recorder.rec === "recording" && recorder.remaining <= COUNTDOWN_FROM;

  return (
    <main className="container">
      <Nav />
      {loadError && <p className="warn">{loadError}</p>}
      {meta && !meta.grader.configured && <p className="warn">ANTHROPIC_API_KEY is not set — Say it needs Claude.</p>}
      {meta && !meta.storageConfigured && (
        <p className="warn">BLOB_READ_WRITE_TOKEN is not set — sentences aren&apos;t saved and audio isn&apos;t cached.</p>
      )}
      {meta && voices.length === 0 && <p className="warn">No TTS voice is configured (Azure or ElevenLabs).</p>}

      {meta && <ModelToggle meta={meta} model={model} onChange={choose} title="Model" />}

      <form className="card say-form" onSubmit={generate}>
        <label htmlFor="en">Type English</label>
        <textarea id="en" rows={2} value={english} onChange={(e) => setEnglish(e.target.value)} placeholder="I want to go to the sea with my friends tomorrow." />
        <button className="btn primary" disabled={generating || !english.trim() || !meta?.grader.configured}>
          {generating ? "Translating…" : "Say it"}
        </button>
        {genError && <p className="warn">{genError}</p>}
      </form>

      {current && (
        <section className="card sentence">
          <div className="sentence-head">
            <span className="tag">{current.status}</span>
            {cards.some((c) => c.id === current.id) && (
              <button className={`star ${current.starred ? "on" : ""}`} onClick={() => setStar(current, !current.starred)} aria-pressed={current.starred} title="Ask my tutor">
                {current.starred ? "★" : "☆"} ask tutor
              </button>
            )}
          </div>
          <p className="muted">{current.english}</p>
          <p className="translit-big">{current.translit}</p>
          <p className="arabic-big" dir="rtl" lang="ar">{current.arabic}</p>
          <p className="small muted">
            Spoken spelling (sent to TTS): <span dir="rtl" lang="ar" className="tts-spelling">{current.tts_spelling}</span>
          </p>
          {current.notes && <p className="small">{current.notes}</p>}

          {voices.length > 0 && (
            <label className="voice-pick small">
              Voice{" "}
              <select value={voiceId} onChange={(e) => chooseVoice(e.target.value)}>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </label>
          )}
          {voiceId && <Player text={current.tts_spelling} words={current.words} voiceId={voiceId} getSpeech={getSpeech} />}

          <div className="attempt">
            {meta && <ConsensusOptIn meta={meta} optIn={optIn} onToggle={toggleOptIn} />}
            <button
              className={`btn ${recorder.rec === "recording" ? "rec-on" : ""}`}
              onClick={recorder.rec === "recording" ? recorder.stop : recordAttempt}
              disabled={recorder.rec === "processing" || !meta?.grader.configured || attempt?.status === "transcribing" || attempt?.status === "grading"}
            >
              {recorder.rec === "recording" ? (counting ? `Stop (${recorder.remaining})` : "■ Stop recording") : "● Record my attempt"}
            </button>
            {recorder.rec === "recording" && (
              <p className={counting ? "countdown" : "muted small"}>
                {counting ? `Stopping in ${recorder.remaining} s` : `${recorder.elapsed.toFixed(0)} s / ${MAX_SECONDS} s`}
              </p>
            )}
            {recorder.error && <p className="warn">{recorder.error}</p>}
            {attempt?.status === "transcribing" && <p className="muted">Transcribing…</p>}
            {attempt && "discarded" in attempt && attempt.discarded.length > 0 && (
              <ul className="discarded small">
                {attempt.discarded.map((d) => (
                  <li key={d.providerId}>Discarded {d.label}: {d.reason}</li>
                ))}
              </ul>
            )}
            {attempt?.status === "grading" && <p className="muted">Grading with {modelLabel(model)}…</p>}
            {attempt?.status === "error" && <p className="warn">{attempt.error}</p>}
            {attempt?.status === "done" && <GradeCard state={attempt.grade} modelLabel={modelLabel} />}
          </div>
        </section>
      )}

      {meta?.storageConfigured && (
        <section className="card saved">
          <div className="saved-head">
            <h2>Saved sentences ({cards.length})</h2>
            <label className="small">
              <input type="checkbox" checked={starredOnly} onChange={(e) => setStarredOnly(e.target.checked)} /> ★ only
            </label>
          </div>
          {cardsError && <p className="warn">{cardsError}</p>}
          {shown.length === 0 && <p className="muted small">{starredOnly ? "No starred sentences." : "Nothing saved yet."}</p>}
          <ul className="card-list">
            {shown.map((c) => (
              <li key={c.id} className={current?.id === c.id ? "on" : ""}>
                <button className="card-open" onClick={() => { setCurrent(c); setAttempt(null); }}>
                  <span>{c.english}</span>
                  <span className="muted small">{c.translit}</span>
                </button>
                <button className={`star ${c.starred ? "on" : ""}`} onClick={() => setStar(c, !c.starred)} aria-pressed={c.starred} aria-label="Ask my tutor">
                  {c.starred ? "★" : "☆"}
                </button>
                <button className="link small" onClick={() => removeCard(c)} aria-label="Delete">✕</button>
              </li>
            ))}
          </ul>

          <div className="playlist">
            <h2>MP3 playlist</h2>
            <div className="playlist-opts small">
              <label>
                <select value={playlistScope} onChange={(e) => setPlaylistScope(e.target.value as "all" | "starred")}>
                  <option value="all">All sentences</option>
                  <option value="starred">★ only</option>
                </select>
              </label>
              <label>
                Pause{" "}
                <select value={pause} onChange={(e) => setPause(Number(e.target.value))}>
                  {[2, 3, 5, 8].map((s) => (
                    <option key={s} value={s}>{s} s</option>
                  ))}
                </select>
              </label>
            </div>
            <button className="btn" onClick={downloadPlaylist} disabled={playlist.busy || !voiceId || cards.filter((c) => playlistScope === "all" || c.starred).length === 0}>
              {playlist.busy ? playlist.progress : "Build MP3 playlist"}
            </button>
            {!playlist.busy && playlist.url && (
              <p className="small">
                <a href={playlist.url} download="kalam-playlist.mp3">Download kalam-playlist.mp3</a> · {playlist.progress}
              </p>
            )}
            {playlist.error && <p className="warn">{playlist.error}</p>}
            <p className="muted small">Uses the voice selected above. Sentences already played are served from the cache.</p>
          </div>
        </section>
      )}
    </main>
  );
}
