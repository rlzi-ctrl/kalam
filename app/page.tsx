"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GradeCard } from "@/components/GradeCard";
import { toWav16kMono } from "@/lib/audio/wav";
import type { Transcript } from "@/lib/consensus";
import {
  consensusStatus,
  doneTranscripts,
  formatEverythingText,
  formatPromptText,
  hasResults,
  type ConsensusRun,
  type GradeState,
  type PromptSession,
  type ProviderResult,
  type Row,
} from "@/lib/results";
import { TEST_PROMPTS } from "@/lib/seed";
import type { ProviderInfo } from "@/lib/stt/registry";

const MAX_SECONDS = 60;
const COUNTDOWN_FROM = 10;
const PASSCODE_KEY = "kalam_passcode";
const MODEL_KEY = "kalam_grader_model";

type ModelOption = { id: string; label: string };
type Meta = {
  providers: ProviderInfo[];
  grader: { configured: boolean; defaultModel: string; models: ModelOption[] };
  passcodeEnabled: boolean;
};
type RecState = "idle" | "recording" | "processing";

class AuthError extends Error {}

function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the value lasts for this page load only.
  }
}

function freshSession(providers: ProviderInfo[]): PromptSession {
  return {
    clip: null,
    consensus: [],
    rows: providers.map((p) => ({
      id: p.id,
      label: p.label,
      inConsensus: p.inConsensus,
      result: p.configured ? { status: "idle" } : { status: "unconfigured", missing: p.missing },
      grade: { status: "idle" },
    })),
  };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without async clipboard access.
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export default function Home() {
  const [passcode, setPasscode] = useState("");
  const [passcodeDraft, setPasscodeDraft] = useState("");
  const [needPasscode, setNeedPasscode] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState("");
  const [model, setModel] = useState("");

  const [promptIndex, setPromptIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [rec, setRec] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState<Record<string, PromptSession>>({});
  const [recError, setRecError] = useState("");
  const [copied, setCopied] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  // Per-prompt attempt counter: a new recording bumps it, so late responses for an old clip are dropped.
  const attemptRef = useRef<Record<string, number>>({});
  const modelRef = useRef("");
  modelRef.current = model;

  const prompt = TEST_PROMPTS[promptIndex];
  const session = sessions[prompt.id] ?? (meta ? freshSession(meta.providers) : undefined);
  const modelLabel = (id: string) => meta?.grader.models.find((m) => m.id === id)?.label ?? id;

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (passcode) headers.set("x-app-passcode", passcode);
      const res = await fetch(path, { ...init, headers });
      if (res.status === 401) {
        setNeedPasscode(true);
        throw new AuthError("passcode required");
      }
      return res;
    },
    [passcode],
  );

  useEffect(() => {
    setPasscode(readStored(PASSCODE_KEY));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api("/api/providers")
      .then((r) => r.json())
      .then((m: Meta) => {
        if (cancelled) return;
        setMeta(m);
        setNeedPasscode(false);
        const stored = readStored(MODEL_KEY);
        setModel(m.grader.models.some((x) => x.id === stored) ? stored : m.grader.defaultModel);
      })
      .catch((err) => {
        if (!cancelled && !(err instanceof AuthError)) setLoadError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  /** Applies fn to a prompt's session, unless a newer recording has replaced that attempt. */
  const update = useCallback(
    (promptId: string, attempt: number, fn: (s: PromptSession) => PromptSession) => {
      if (!meta || attemptRef.current[promptId] !== attempt) return;
      setSessions((all) => ({ ...all, [promptId]: fn(all[promptId] ?? freshSession(meta.providers)) }));
    },
    [meta],
  );

  const updateRow = (promptId: string, attempt: number, id: string, patch: Partial<Row>) =>
    update(promptId, attempt, (s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const updateRun = (promptId: string, attempt: number, key: string, run: ConsensusRun) =>
    update(promptId, attempt, (s) => ({ ...s, consensus: s.consensus.map((c) => (c.key === key ? run : c)) }));

  const postGrade = async (promptId: string, mode: "consensus" | "single", transcripts: Transcript[], gradeModel: string) => {
    const res = await api("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptId, mode, model: gradeModel, transcripts }),
    });
    return { ok: res.ok, status: res.status, json: await res.json() };
  };

  const runConsensus = async (promptId: string, attempt: number, transcripts: Transcript[]) => {
    const gradeModel = modelRef.current;
    const key = `${Date.now()}-${Math.random()}`;
    const pending: ConsensusRun = { key, status: "loading", requestedModel: gradeModel, used: [], discarded: [] };
    update(promptId, attempt, (s) => ({ ...s, consensus: [...s.consensus, pending] }));
    try {
      const { ok, status, json } = await postGrade(promptId, "consensus", transcripts, gradeModel);
      const base = { key, requestedModel: gradeModel, used: json.used ?? [], discarded: json.discarded ?? [] };
      updateRun(
        promptId,
        attempt,
        key,
        ok ? { ...base, ...json, status: "done" } : { ...base, status: "error", error: json.error ?? `HTTP ${status}`, ms: json.ms },
      );
    } catch (err) {
      updateRun(promptId, attempt, key, { key, status: "error", requestedModel: gradeModel, error: String(err), used: [], discarded: [] });
    }
  };

  const gradeAlone = async (promptId: string, row: Row) => {
    if (row.result.status !== "done" || !row.result.text) return;
    const attempt = attemptRef.current[promptId];
    const gradeModel = modelRef.current;
    updateRow(promptId, attempt, row.id, { grade: { status: "loading", requestedModel: gradeModel } });
    let grade: GradeState;
    try {
      const transcript = { providerId: row.id, label: row.label, text: row.result.text };
      const { ok, status, json } = await postGrade(promptId, "single", [transcript], gradeModel);
      grade = ok
        ? { ...json, status: "done", requestedModel: gradeModel }
        : { status: "error", requestedModel: gradeModel, error: json.error ?? `HTTP ${status}`, ms: json.ms };
    } catch (err) {
      grade = { status: "error", requestedModel: gradeModel, error: String(err) };
    }
    updateRow(promptId, attempt, row.id, { grade });
  };

  const transcribeAll = async (promptId: string, attempt: number, wav: Blob): Promise<Transcript[]> => {
    const targets = (meta?.providers ?? []).filter((p) => p.configured);
    const results = await Promise.all(
      targets.map(async (p): Promise<Transcript | null> => {
        updateRow(promptId, attempt, p.id, { result: { status: "loading" } });
        let result: ProviderResult;
        try {
          const form = new FormData();
          form.append("provider", p.id);
          form.append("audio", wav, "clip.wav");
          const res = await api("/api/transcribe", { method: "POST", body: form });
          const json = await res.json();
          result = res.ok
            ? { status: "done", text: json.text, note: json.note, ms: json.ms }
            : { status: "error", error: json.error ?? `HTTP ${res.status}`, ms: json.ms };
        } catch (err) {
          result = { status: "error", error: String(err) };
        }
        updateRow(promptId, attempt, p.id, { result });
        return result.status === "done" ? { providerId: p.id, label: p.label, text: result.text } : null;
      }),
    );
    return results.filter((t): t is Transcript => t !== null);
  };

  const stopTimer = () => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startRecording = async () => {
    if (!meta) return;
    const promptId = prompt.id;
    setRecError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setRecError(`Microphone unavailable: ${String(err)}`);
      return;
    }

    // A new recording replaces this prompt's previous attempt; other prompts keep theirs.
    const attempt = (attemptRef.current[promptId] ?? 0) + 1;
    attemptRef.current[promptId] = attempt;
    setSessions((all) => {
      const old = all[promptId]?.clip;
      if (old) URL.revokeObjectURL(old.url);
      return { ...all, [promptId]: freshSession(meta.providers) };
    });

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      stopTimer();
      stream.getTracks().forEach((t) => t.stop());
      setRec("processing");
      try {
        const { wav, seconds } = await toWav16kMono(new Blob(chunks, { type: recorder.mimeType }));
        update(promptId, attempt, (s) => ({ ...s, clip: { url: URL.createObjectURL(wav), seconds } }));
        setRec("idle");
        const transcripts = await transcribeAll(promptId, attempt, wav);
        // Consensus grading runs by default once the transcripts are in.
        if (meta.grader.configured && transcripts.length > 0) await runConsensus(promptId, attempt, transcripts);
      } catch (err) {
        setRecError(`Could not process recording: ${String(err)}`);
        setRec("idle");
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setRec("recording");
    setElapsed(0);
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const s = (Date.now() - started) / 1000;
      setElapsed(s);
      if (s >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
    }, 200);
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const goToPrompt = (i: number) => {
    if (rec !== "idle") return;
    setPromptIndex((i + TEST_PROMPTS.length) % TEST_PROMPTS.length);
    setShowAnswer(false);
  };

  const flashCopied = (label: string) => {
    setCopied(label);
    window.setTimeout(() => setCopied(""), 2500);
  };

  const copyPrompt = async () => {
    flashCopied((await copyText(formatPromptText(prompt, session))) ? "prompt" : "failed");
  };

  const copyEverything = async () => {
    flashCopied((await copyText(formatEverythingText(TEST_PROMPTS, sessions))) ? "everything" : "failed");
  };

  const chooseModel = (id: string) => {
    setModel(id);
    writeStored(MODEL_KEY, id);
  };

  const savePasscode = (e: React.FormEvent) => {
    e.preventDefault();
    writeStored(PASSCODE_KEY, passcodeDraft);
    setPasscode(passcodeDraft);
  };

  if (needPasscode) {
    return (
      <main className="container">
        <h1>Kalam · voice spike</h1>
        <form className="card passcode" onSubmit={savePasscode}>
          <label htmlFor="pc">Passcode</label>
          <input
            id="pc"
            type="password"
            autoComplete="current-password"
            value={passcodeDraft}
            onChange={(e) => setPasscodeDraft(e.target.value)}
          />
          <button type="submit" className="btn primary">Unlock</button>
          {passcode && <p className="muted">That passcode didn&apos;t work.</p>}
        </form>
      </main>
    );
  }

  const remaining = Math.max(0, Math.ceil(MAX_SECONDS - elapsed));
  const counting = rec === "recording" && remaining <= COUNTDOWN_FROM;
  const recordLabel = rec === "recording" ? (counting ? String(remaining) : "Stop") : rec === "processing" ? "…" : "Record";
  const status = session ? consensusStatus(session.rows) : {};
  const consensusInput = session ? doneTranscripts(session.rows).filter((t) => status[t.providerId] === "used in consensus") : [];
  const consensusBusy = session?.consensus.some((c) => c.status === "loading") ?? false;
  const answeredCount = TEST_PROMPTS.filter((p) => hasResults(sessions[p.id])).length;

  return (
    <main className="container">
      <header className="top">
        <h1>Kalam · voice spike</h1>
        {meta && !meta.passcodeEnabled && <p className="warn">APP_PASSCODE is not set — anyone with this URL can use your API keys.</p>}
        {meta && !meta.grader.configured && <p className="warn">ANTHROPIC_API_KEY is not set — grading is disabled.</p>}
        {loadError && <p className="warn">{loadError}</p>}
      </header>

      {meta && (
        <div className="model-toggle" role="radiogroup" aria-label="Grader model">
          <span className="muted small">Grader</span>
          {meta.grader.models.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={model === m.id}
              className={`seg ${model === m.id ? "on" : ""}`}
              onClick={() => chooseModel(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <section className="card prompt">
        <div className="prompt-nav">
          <button className="btn" onClick={() => goToPrompt(promptIndex - 1)} disabled={rec !== "idle"} aria-label="Previous prompt">‹</button>
          <span className="muted">
            {promptIndex + 1} / {TEST_PROMPTS.length} · {prompt.kind}
            {hasResults(sessions[prompt.id]) ? " · has results" : ""}
          </span>
          <button className="btn" onClick={() => goToPrompt(promptIndex + 1)} disabled={rec !== "idle"} aria-label="Next prompt">›</button>
        </div>
        <p className="prompt-en">{prompt.en}</p>
        {(prompt.answerKey || prompt.referenceTranslit || prompt.tutorPartial) && (
          <button className="link" onClick={() => setShowAnswer((s) => !s)}>
            {showAnswer ? "Hide" : "Show"} answer
          </button>
        )}
        {showAnswer && prompt.answerKey && (
          <div className="answer">
            <span className="tag">answer key · {prompt.answerKey.status}</span>
            <p>{prompt.answerKey.translit}</p>
            <p className="arabic" dir="rtl" lang="ar">{prompt.answerKey.arabic}</p>
          </div>
        )}
        {showAnswer && prompt.referenceTranslit && <p className="answer">{prompt.referenceTranslit}</p>}
        {showAnswer && prompt.tutorPartial && <p className="answer muted">Tutor started: {prompt.tutorPartial}…</p>}
      </section>

      <section className="record">
        <button
          className={`record-btn ${rec} ${counting ? "counting" : ""}`}
          onClick={rec === "recording" ? stopRecording : startRecording}
          disabled={rec === "processing" || !meta}
          aria-label={rec === "recording" ? "Stop recording" : "Record"}
        >
          {recordLabel}
        </button>
        <p className={counting ? "countdown" : "muted"}>
          {rec === "recording"
            ? counting
              ? `Stopping in ${remaining} s`
              : `${elapsed.toFixed(0)} s / ${MAX_SECONDS} s`
            : session?.clip
              ? `Clip: ${session.clip.seconds.toFixed(1)} s`
              : "Tap, say it in Levantine, tap again"}
        </p>
        {session?.clip && <audio controls src={session.clip.url} className="player" />}
        {recError && <p className="warn">{recError}</p>}
      </section>

      <section className="actions">
        <button
          className="btn primary"
          disabled={!meta?.grader.configured || consensusInput.length === 0 || consensusBusy}
          onClick={() => runConsensus(prompt.id, attemptRef.current[prompt.id], consensusInput)}
        >
          {session?.consensus.length ? `Grade again with ${modelLabel(model)}` : `Consensus grade (${consensusInput.length})`}
        </button>
        <button className="btn" onClick={copyPrompt} disabled={!meta}>
          {copied === "prompt" ? "Copied ✓" : "Copy this prompt"}
        </button>
        <button className="btn" onClick={copyEverything} disabled={!meta}>
          {copied === "everything" ? "Copied ✓" : `Copy everything (${answeredCount})`}
        </button>
        {copied === "failed" && <p className="warn">Copy failed</p>}
      </section>

      {session?.consensus.length ? (
        <section className="consensus">
          {session.consensus.map((run, i) => (
            <article key={run.key} className="card">
              <h2>
                Consensus grade{session.consensus.length > 1 ? ` ${i + 1}` : ""} · {modelLabel(run.requestedModel)}
                {run.status === "done" ? ` · ${(run.ms / 1000).toFixed(1)} s` : ""}
              </h2>
              {run.discarded.length > 0 && (
                <ul className="discarded small">
                  {run.discarded.map((d) => (
                    <li key={d.providerId}>Discarded {d.label}: {d.reason}</li>
                  ))}
                </ul>
              )}
              {run.status === "loading" && <p className="muted">Grading…</p>}
              {run.status === "error" && <p className="warn">{run.error}</p>}
              {run.status === "done" && <GradeCard state={run} modelLabel={modelLabel} />}
            </article>
          ))}
        </section>
      ) : null}

      <section className="grid">
        {session?.rows.map((row) => (
          <article key={row.id} className={`card provider ${row.result.status}`}>
            <h2>{row.label}</h2>
            <ProviderBody result={row.result} />
            {row.result.status === "done" && status[row.id] && (
              <p className={`small ${status[row.id].startsWith("discarded") ? "warn" : "muted"}`}>{status[row.id]}</p>
            )}
            {row.result.status === "done" && row.result.text && (
              <>
                {row.grade.status === "idle" && (
                  <button className="link small" onClick={() => gradeAlone(prompt.id, row)} disabled={!meta?.grader.configured}>
                    Grade this transcript alone
                  </button>
                )}
                {row.grade.status === "loading" && <p className="muted">Grading…</p>}
                {row.grade.status === "error" && (
                  <>
                    <p className="warn">{row.grade.error}</p>
                    <button className="link small" onClick={() => gradeAlone(prompt.id, row)}>Retry</button>
                  </>
                )}
                {row.grade.status === "done" && <GradeCard state={row.grade} modelLabel={modelLabel} />}
              </>
            )}
          </article>
        ))}
      </section>

      <footer className="muted foot">
        Consensus uses ElevenLabs, whisper-1 and gpt-4o-transcribe. Transcripts are what each system heard — not a
        pronunciation score.
      </footer>
    </main>
  );
}

function ProviderBody({ result }: { result: ProviderResult }) {
  switch (result.status) {
    case "unconfigured":
      return <p className="muted">Not configured (set {result.missing.join(", ")})</p>;
    case "idle":
      return <p className="muted">Waiting for a recording</p>;
    case "loading":
      return <p className="muted">Transcribing…</p>;
    case "error":
      return <p className="warn">{result.error}</p>;
    case "done":
      return (
        <>
          <p className="transcript" dir="auto">{result.text || <span className="muted">(nothing heard)</span>}</p>
          <p className="muted small">
            {result.ms} ms{result.note ? ` · ${result.note}` : ""}
          </p>
        </>
      );
  }
}
