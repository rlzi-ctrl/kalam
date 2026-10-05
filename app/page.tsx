"use client";

import { useCallback, useRef, useState } from "react";
import { GradeCard } from "@/components/GradeCard";
import { AnswerKeyPanel } from "@/components/AnswerKeyPanel";
import { ConsensusOptIn, useConsensusOptIn } from "@/components/ConsensusOptIn";
import { ModelToggle, useModelChoice } from "@/components/ModelToggle";
import { Nav } from "@/components/Nav";
import { PasscodeScreen } from "@/components/PasscodeScreen";
import { postGrade, transcribeAll } from "@/lib/client/transcribe";
import { useAppApi } from "@/lib/client/useAppApi";
import { useRecorder } from "@/lib/client/useRecorder";
import type { Transcript } from "@/lib/consensus";
import {
  consensusStatus,
  doneTranscripts,
  formatEverythingText,
  formatPromptText,
  hasResults,
  USED,
  type ConsensusRun,
  type GradeState,
  type PromptSession,
  type Row,
} from "@/lib/results";
import { TEST_PROMPTS } from "@/lib/seed";
import type { ProviderInfo } from "@/lib/stt/registry";

const MAX_SECONDS = 60;
const COUNTDOWN_FROM = 10;

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
  const { api, meta, loadError, needPasscode, passcodeTried, submitPasscode } = useAppApi();
  const { model, choose: chooseModel, label: modelLabel } = useModelChoice(meta);
  const { optIn, toggle: toggleOptIn } = useConsensusOptIn();
  const recorder = useRecorder(MAX_SECONDS);

  const [promptIndex, setPromptIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessions, setSessions] = useState<Record<string, PromptSession>>({});
  const [copied, setCopied] = useState("");

  // Per-prompt attempt counter: a new recording bumps it, so late responses for an old clip are dropped.
  const attemptRef = useRef<Record<string, number>>({});
  const modelRef = useRef("");
  modelRef.current = model;
  const optInRef = useRef<string[]>([]);
  optInRef.current = optIn;

  const prompt = TEST_PROMPTS[promptIndex];
  const session = sessions[prompt.id] ?? (meta ? freshSession(meta.providers) : undefined);

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

  const runConsensus = async (promptId: string, attempt: number, transcripts: Transcript[]) => {
    const gradeModel = modelRef.current;
    const runOptIn = optInRef.current;
    const key = `${Date.now()}-${Math.random()}`;
    const empty = { used: [], discarded: [], skipped: [], optIn: runOptIn };
    const pending: ConsensusRun = { key, status: "loading", requestedModel: gradeModel, ...empty };
    update(promptId, attempt, (s) => ({ ...s, consensus: [...s.consensus, pending] }));
    try {
      const { ok, status, json } = await postGrade(api, { promptId, mode: "consensus", model: gradeModel, transcripts, optIn: runOptIn });
      const base = {
        key,
        requestedModel: gradeModel,
        used: json.used ?? [],
        discarded: json.discarded ?? [],
        skipped: json.skipped ?? [],
        optIn: runOptIn,
      };
      updateRun(
        promptId,
        attempt,
        key,
        ok ? { ...base, ...json, status: "done" } : { ...base, status: "error", error: json.error ?? `HTTP ${status}`, ms: json.ms },
      );
    } catch (err) {
      updateRun(promptId, attempt, key, { key, status: "error", requestedModel: gradeModel, error: String(err), ...empty });
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
      const { ok, status, json } = await postGrade(api, { promptId, mode: "single", model: gradeModel, transcripts: [transcript] });
      grade = ok
        ? { ...json, status: "done", requestedModel: gradeModel }
        : { status: "error", requestedModel: gradeModel, error: json.error ?? `HTTP ${status}`, ms: json.ms };
    } catch (err) {
      grade = { status: "error", requestedModel: gradeModel, error: String(err) };
    }
    updateRow(promptId, attempt, row.id, { grade });
  };

  const startRecording = async () => {
    if (!meta) return;
    const promptId = prompt.id;
    // A new recording replaces this prompt's previous attempt; other prompts keep theirs.
    const attempt = (attemptRef.current[promptId] ?? 0) + 1;
    const started = await recorder.start(async ({ wav, seconds }) => {
      update(promptId, attempt, (s) => ({ ...s, clip: { url: URL.createObjectURL(wav), seconds } }));
      const configured = meta.providers.filter((p) => p.configured);
      const transcripts = await transcribeAll(api, configured, wav, (id, result) => updateRow(promptId, attempt, id, { result }));
      // Consensus grading runs by default once the transcripts are in.
      if (meta.grader.configured && transcripts.length > 0) await runConsensus(promptId, attempt, transcripts);
    });
    if (!started) return;
    attemptRef.current[promptId] = attempt;
    setSessions((all) => {
      const old = all[promptId]?.clip;
      if (old) URL.revokeObjectURL(old.url);
      return { ...all, [promptId]: freshSession(meta.providers) };
    });
  };

  const goToPrompt = (i: number) => {
    if (recorder.rec !== "idle") return;
    setPromptIndex((i + TEST_PROMPTS.length) % TEST_PROMPTS.length);
    setShowAnswer(false);
  };

  const flashCopied = (label: string) => {
    setCopied(label);
    window.setTimeout(() => setCopied(""), 2500);
  };

  const copyPrompt = async () => {
    flashCopied((await copyText(formatPromptText(prompt, session, { optIn }))) ? "prompt" : "failed");
  };

  const copyEverything = async () => {
    flashCopied((await copyText(formatEverythingText(TEST_PROMPTS, sessions, { optIn }))) ? "everything" : "failed");
  };

  if (needPasscode) return <PasscodeScreen tried={passcodeTried} onSubmit={submitPasscode} />;

  const { rec, elapsed, remaining } = recorder;
  const counting = rec === "recording" && remaining <= COUNTDOWN_FROM;
  const recordLabel = rec === "recording" ? (counting ? String(remaining) : "Stop") : rec === "processing" ? "…" : "Record";
  const status = session ? consensusStatus(session.rows, { optIn }) : {};
  // Send every transcript; the server picks the votes (one Azure vote, opt-ins) the same way the badges do.
  const consensusInput = session ? doneTranscripts(session.rows) : [];
  const votes = Object.values(status).filter((s) => s === USED).length;
  const consensusBusy = session?.consensus.some((c) => c.status === "loading") ?? false;
  const answeredCount = TEST_PROMPTS.filter((p) => hasResults(sessions[p.id])).length;

  return (
    <main className="container">
      <Nav />
      <header className="top">
        {meta && !meta.passcodeEnabled && <p className="warn">APP_PASSCODE is not set — anyone with this URL can use your API keys.</p>}
        {meta && !meta.grader.configured && <p className="warn">ANTHROPIC_API_KEY is not set — grading is disabled.</p>}
        {loadError && <p className="warn">{loadError}</p>}
      </header>

      {meta && <ModelToggle meta={meta} model={model} onChange={chooseModel} />}
      {meta && <ConsensusOptIn meta={meta} optIn={optIn} onToggle={toggleOptIn} />}

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
        {showAnswer && prompt.answerKey && <AnswerKeyPanel api={api} prompt={prompt} model={model} />}
        {showAnswer && prompt.referenceTranslit && <p className="answer">{prompt.referenceTranslit}</p>}
        {showAnswer && prompt.tutorPartial && <p className="answer muted">Tutor started: {prompt.tutorPartial}…</p>}
      </section>

      <section className="record">
        <button
          className={`record-btn ${rec} ${counting ? "counting" : ""}`}
          onClick={rec === "recording" ? recorder.stop : startRecording}
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
        {recorder.error && <p className="warn">{recorder.error}</p>}
      </section>

      <section className="actions">
        <button
          className="btn primary"
          disabled={!meta?.grader.configured || votes === 0 || consensusBusy}
          onClick={() => runConsensus(prompt.id, attemptRef.current[prompt.id], consensusInput)}
        >
          {session?.consensus.length ? `Grade again with ${modelLabel(model)}` : `Consensus grade (${votes} ${votes === 1 ? "vote" : "votes"})`}
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
              {run.skipped.length > 0 && (
                <ul className="skipped small muted">
                  {run.skipped.map((d) => (
                    <li key={d.providerId}>Not counted: {d.label} ({d.reason})</li>
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
            <ProviderBody row={row} />
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
        Consensus votes: ElevenLabs, whisper-1, and Azure (all locales together count as one vote); gpt-4o-transcribe
        only when switched on. Transcripts are what each system heard — not a pronunciation score.
      </footer>
    </main>
  );
}

function ProviderBody({ row }: { row: Row }) {
  const result = row.result;
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
