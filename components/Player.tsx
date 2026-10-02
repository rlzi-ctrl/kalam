"use client";

import { useEffect, useRef, useState } from "react";
import type { TtsClip } from "@/lib/client/useTts";
import type { SayWord } from "@/lib/say/schema";

type Props = {
  /** Text sent to TTS for the whole sentence (the card's tts_spelling). */
  text: string;
  words: SayWord[];
  voiceId: string;
  getSpeech: (voiceId: string, text: string) => Promise<TtsClip>;
};

type Phase = "idle" | "playing" | "listen" | "your-turn";

const SHADOW_EXTRA_SECONDS = 1;

/** Loop, 0.75x, tap-a-word, and shadowing (play → pause for you to repeat → replay). */
export function Player({ text, words, voiceId, getSpeech }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(0); // bumped to cancel shadowing / pending plays
  const [clip, setClip] = useState<TtsClip | null>(null);
  const [error, setError] = useState("");
  const [loop, setLoop] = useState(false);
  const [slow, setSlow] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeWord, setActiveWord] = useState<number | null>(null);
  const rate = slow ? 0.75 : 1;

  // Fetch the sentence (and, in the background, each word) as soon as it is shown, so taps play instantly.
  useEffect(() => {
    let cancelled = false;
    setClip(null);
    setError("");
    stop();
    getSpeech(voiceId, text)
      .then((c) => {
        if (cancelled) return;
        setClip(c);
        for (const w of words) getSpeech(voiceId, w.tts_spelling).catch(() => {});
      })
      .catch((err) => !cancelled && setError(String(err instanceof Error ? err.message : err)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, voiceId]);

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const el = () => (audioRef.current ??= new Audio());

  function stop() {
    sessionRef.current++;
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.loop = false;
    }
    setPhase("idle");
    setActiveWord(null);
  }

  /** Plays url once; resolves when it ends or is interrupted. */
  function playOnce(url: string, session: number): Promise<number> {
    const a = el();
    a.loop = false;
    a.src = url;
    a.playbackRate = rate;
    a.preservesPitch = true;
    return new Promise((resolve) => {
      const done = () => {
        a.removeEventListener("ended", done);
        a.removeEventListener("pause", done);
        resolve(Number.isFinite(a.duration) ? a.duration : 0);
      };
      a.addEventListener("ended", done);
      a.addEventListener("pause", done);
      a.play().catch((err) => {
        if (session === sessionRef.current) setError(`Playback blocked: ${String(err)}`);
        done();
      });
    });
  }

  const play = () => {
    if (!clip) return;
    stop();
    const session = sessionRef.current;
    setPhase("playing");
    const a = el();
    playOnce(clip.url, session).then(() => {
      if (session === sessionRef.current) setPhase("idle");
    });
    a.loop = loop;
  };

  const shadow = async () => {
    if (!clip) return;
    stop();
    const session = sessionRef.current;
    while (session === sessionRef.current) {
      setPhase("listen");
      const seconds = await playOnce(clip.url, session);
      if (session !== sessionRef.current) return;
      setPhase("your-turn");
      // Time to repeat it yourself: as long as the clip took to play, plus a beat.
      await new Promise((r) => setTimeout(r, (seconds / rate + SHADOW_EXTRA_SECONDS) * 1000));
    }
  };

  const playWord = async (i: number) => {
    stop();
    const session = sessionRef.current;
    setActiveWord(i);
    try {
      const w = await getSpeech(voiceId, words[i].tts_spelling);
      if (session !== sessionRef.current) return;
      await playOnce(w.url, session);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
    if (session === sessionRef.current) setActiveWord(null);
  };

  // Loop and speed apply to whatever is playing right now.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);
  useEffect(() => {
    if (audioRef.current && phase === "playing") audioRef.current.loop = loop;
  }, [loop, phase]);

  return (
    <div className="player-box">
      <div className="words" dir="rtl" lang="ar">
        {words.map((w, i) => (
          <button key={i} className={`word ${activeWord === i ? "on" : ""} ${w.known ? "" : "new"}`} onClick={() => playWord(i)} title={w.en}>
            <span className="word-ar">{w.arabic}</span>
            <span className="word-tr" dir="ltr">{w.translit}</span>
            <span className="word-en" dir="ltr">{w.en}</span>
          </button>
        ))}
      </div>
      <p className="muted small">Tap a word to hear it alone. Dashed words are not in your vocab list yet.</p>

      <div className="player-controls">
        {phase === "idle" ? (
          <button className="btn primary" onClick={play} disabled={!clip}>
            {clip ? "▶ Play" : error ? "Audio failed" : "Loading audio…"}
          </button>
        ) : (
          <button className="btn primary" onClick={stop}>■ Stop</button>
        )}
        <button className={`seg ${loop ? "on" : ""}`} aria-pressed={loop} onClick={() => setLoop((v) => !v)}>Loop</button>
        <button className={`seg ${slow ? "on" : ""}`} aria-pressed={slow} onClick={() => setSlow((v) => !v)}>0.75×</button>
        <button className={`seg ${phase === "listen" || phase === "your-turn" ? "on" : ""}`} onClick={phase === "listen" || phase === "your-turn" ? stop : shadow} disabled={!clip}>
          Shadow
        </button>
      </div>
      {(phase === "listen" || phase === "your-turn") && (
        <p className={`shadow-phase ${phase}`}>{phase === "listen" ? "Listen…" : "Your turn — say it"}</p>
      )}
      {clip && (
        <p className="muted small">
          Audio {clip.cache === "hit" ? "from cache" : clip.cache === "miss" ? `generated (${clip.chars} chars, now cached)` : `generated (${clip.chars} chars, cache off)`}
        </p>
      )}
      {error && <p className="warn">{error}</p>}
    </div>
  );
}
