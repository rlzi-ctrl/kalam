"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useModelChoice } from "@/components/ModelToggle";
import { Nav } from "@/components/Nav";
import { PasscodeScreen } from "@/components/PasscodeScreen";
import { SoundLetters } from "@/components/SoundLetters";
import { VOICE_KEY, readStored } from "@/lib/client/prefs";
import { useAppApi } from "@/lib/client/useAppApi";
import { useLexicon } from "@/lib/client/useLexicon";
import { useTts } from "@/lib/client/useTts";
import { SOUNDS, soundById, type SoundId } from "@/lib/langpacks/sounds";
import { soundExamples } from "@/lib/lexicon/sounds";
import type { MinimalPair, PairWord } from "@/lib/pairs/schema";
import type { WeakSound } from "@/lib/store/soundStats";

export default function SoundsPage() {
  const { api, meta, loadError, needPasscode, passcodeTried, submitPasscode } = useAppApi();
  const lexicon = useLexicon(api, Boolean(meta));
  const getSpeech = useTts(api);
  const { model } = useModelChoice(meta);
  const [weak, setWeak] = useState<{ attempts: number; weak: WeakSound[]; configured: boolean } | null>(null);
  const [pairs, setPairs] = useState<MinimalPair[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [drill, setDrill] = useState<SoundId | null>(null);

  const voiceId = useMemo(() => {
    const usable = meta?.voices.filter((v) => v.configured) ?? [];
    const stored = typeof window === "undefined" ? "" : readStored(VOICE_KEY);
    return usable.some((v) => v.id === stored) ? stored : (usable[0]?.id ?? "");
  }, [meta]);

  const loadPairs = useCallback(async () => {
    try {
      const res = await api("/api/pairs");
      const json = await res.json();
      if (res.ok) setPairs(json.pairs);
    } catch {
      // The pairs section shows its own empty state.
    }
  }, [api]);

  useEffect(() => {
    if (!meta) return;
    api("/api/sounds")
      .then((r) => r.json())
      .then(setWeak)
      .catch(() => {});
    void loadPairs();
  }, [meta, api, loadPairs]);

  const play = async (text: string) => {
    if (!voiceId) return setError("No TTS voice is configured.");
    try {
      const clip = await getSpeech(voiceId, text);
      await new Audio(clip.url).play();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  };

  const generate = async (sound: SoundId) => {
    setBusy(`gen-${sound}`);
    setError("");
    try {
      const res = await api("/api/pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sound, model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPairs((ps) => [...ps, ...json.added]);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy("");
    }
  };

  const review = async (pair: MinimalPair, status: MinimalPair["status"]) => {
    const res = await api(`/api/pairs/${pair.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? `HTTP ${res.status}`);
    setPairs((ps) => ps.map((p) => (p.id === pair.id ? json.pair : p)));
  };

  if (needPasscode) return <PasscodeScreen tried={passcodeTried} onSubmit={submitPasscode} />;

  return (
    <main className="container">
      <Nav />
      <h1>Sounds</h1>
      {loadError && <p className="warn">{loadError}</p>}
      {error && <p className="warn">{error}</p>}
      {meta && !voiceId && <p className="warn">No TTS voice is configured, so audio is off.</p>}

      <section className="card weak">
        <h2>My weak sounds</h2>
        {!weak ? (
          <p className="muted small">Loading…</p>
        ) : !weak.configured ? (
          <p className="muted small">Needs BLOB_READ_WRITE_TOKEN to keep track.</p>
        ) : weak.weak.length === 0 ? (
          <p className="muted small">
            No sound swaps yet{weak.attempts ? ` in ${weak.attempts} graded attempts` : ""}. They appear here when most
            speech-to-text votes hear, say, ه where you meant ح.
          </p>
        ) : (
          <>
            <ol className="weak-list">
              {weak.weak.map((w) => {
                const s = soundById(w.sound)!;
                return (
                  <li key={w.sound}>
                    <a href={`#${s.id}`}>
                      <span dir="rtl" lang="ar" className="weak-letter">{s.letters[0]}</span> {s.symbol} · {s.name}
                    </a>
                    <span className="muted small">
                      {" "}{w.recent} in the last 14 days · {w.total} in all
                      {w.examples[0] ? ` · e.g. ${w.examples[0].word} → ${w.examples[0].heard}` : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="muted small">From {weak.attempts} consensus-graded attempts. A swap counts only when most transcripts agree.</p>
          </>
        )}
      </section>

      {SOUNDS.map((s) => {
        const examples = soundExamples(s, lexicon.concepts);
        const soundPairs = pairs.filter((p) => p.sound === s.id);
        const approved = soundPairs.filter((p) => p.status === "verified");
        const pending = soundPairs.filter((p) => p.status === "unverified");
        const pairable = s.heardAs.some((h) => !h.startsWith("("));
        return (
          <section key={s.id} id={s.id} className="card sound">
            <h2>
              <span dir="rtl" lang="ar" className="sound-letter">{s.letters[0]}</span> {s.symbol} · {s.name}
            </h2>
            <p>{s.tip}</p>
            <p className="small muted">{s.swapNote}</p>
            <button className="btn" onClick={() => play(s.demo.arabic)} disabled={!voiceId}>
              ▶ <span dir="rtl" lang="ar">{s.demo.arabic}</span> {s.demo.translit} · {s.demo.en}
            </button>

            {examples.length > 0 && (
              <>
                <p className="small"><strong>From your words</strong></p>
                <div className="example-words">
                  {examples.map((e) => (
                    <button key={e.translit + e.arabic} className="word" onClick={() => play(e.tts)} disabled={!voiceId}>
                      <span className="word-ar" dir="rtl" lang="ar"><SoundLetters text={e.arabic} /></span>
                      <span className="word-tr">{e.translit}</span>
                      <span className="word-en">{e.en}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {pairable && (
              <div className="pairs">
                <p className="small">
                  <strong>Listening drill</strong> · {approved.length} approved pair{approved.length === 1 ? "" : "s"}
                  {pending.length ? `, ${pending.length} waiting for review` : ""}
                </p>
                {drill === s.id ? (
                  <PairDrill pairs={approved} play={play} onClose={() => setDrill(null)} />
                ) : (
                  <button className="btn" disabled={approved.length === 0 || !voiceId} onClick={() => setDrill(s.id)}>
                    Start drill
                  </button>
                )}{" "}
                <button className="btn" disabled={busy !== "" || !meta?.grader.configured || !meta?.storageConfigured} onClick={() => generate(s.id)}>
                  {busy === `gen-${s.id}` ? "Generating…" : "Generate candidate pairs"}
                </button>
                {pending.length > 0 && (
                  <ul className="pair-review">
                    {pending.map((p) => (
                      <li key={p.id}>
                        <PairWordButton w={p.target} play={play} /> vs <PairWordButton w={p.contrast} play={play} />
                        <span className="tag">unverified</span>
                        <span className="muted small"> {p.note}</span>
                        <span className="pair-actions">
                          <button className="link small" onClick={() => review(p, "verified")}>Approve</button>{" "}
                          <button className="link small" onClick={() => review(p, "rejected")}>Reject</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}

function PairWordButton({ w, play }: { w: PairWord; play: (t: string) => void }) {
  return (
    <button className="link" onClick={() => play(w.tts_spelling)}>
      ▶ <span dir="rtl" lang="ar">{w.arabic}</span> {w.translit} <span className="muted small">({w.en})</span>
    </button>
  );
}

/** Hear one word of an approved pair, pick which one it was. */
function PairDrill({ pairs, play, onClose }: { pairs: MinimalPair[]; play: (t: string) => void; onClose: () => void }) {
  const next = () => ({ pair: pairs[Math.floor(Math.random() * pairs.length)], side: Math.random() < 0.5 ? "target" : "contrast" } as const);
  const [round, setRound] = useState(next);
  const [answer, setAnswer] = useState<"target" | "contrast" | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const heard = round.pair[round.side];

  useEffect(() => {
    play(heard.tts_spelling);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const choose = (side: "target" | "contrast") => {
    if (answer) return;
    setAnswer(side);
    setScore((s) => ({ right: s.right + Number(side === round.side), total: s.total + 1 }));
  };

  return (
    <div className="drill">
      <p className="small">Which word did you hear? · {score.right}/{score.total}</p>
      <button className="btn" onClick={() => play(heard.tts_spelling)}>▶ Play again</button>
      <div className="drill-choices">
        {(["target", "contrast"] as const).map((side) => {
          const w = round.pair[side];
          const state = answer ? (side === round.side ? "right" : side === answer ? "wrong" : "") : "";
          return (
            <button key={side} className={`word drill-choice ${state}`} onClick={() => choose(side)}>
              <span className="word-ar" dir="rtl" lang="ar"><SoundLetters text={w.arabic} /></span>
              <span className="word-tr">{w.translit}</span>
              <span className="word-en">{w.en}</span>
            </button>
          );
        })}
      </div>
      {answer && <p className={answer === round.side ? "encourage" : "warn"}>{answer === round.side ? "Right!" : `It was ${heard.translit}.`}</p>}
      <button className="btn primary" disabled={!answer} onClick={() => { setAnswer(null); setRound(next()); }}>Next</button>{" "}
      <button className="btn" onClick={onClose}>Done</button>
    </div>
  );
}
