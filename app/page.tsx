"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GradeCard } from "@/components/GradeCard";
import { toWav16kMono } from "@/lib/audio/wav";
import { formatResultsText, type GradeState, type ProviderResult, type Row } from "@/lib/results";
import { TEST_PROMPTS } from "@/lib/seed";
import type { ProviderInfo } from "@/lib/stt/registry";

const MAX_SECONDS = 30;
const PASSCODE_KEY = "kalam_passcode";

type Meta = { providers: ProviderInfo[]; grader: { model: string; configured: boolean }; passcodeEnabled: boolean };
type Clip = { wav: Blob; url: string; seconds: number };
type RecState = "idle" | "recording" | "processing";

class AuthError extends Error {}

function readStoredPasscode(): string {
  try {
    return localStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
}

function freshRows(providers: ProviderInfo[]): Row[] {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    result: p.configured ? { status: "idle" } : { status: "unconfigured", missing: p.missing },
    grade: { status: "idle" },
  }));
}

export default function Home() {
  const [passcode, setPasscode] = useState("");
  const [passcodeDraft, setPasscodeDraft] = useState("");
  const [needPasscode, setNeedPasscode] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState("");

  const [promptIndex, setPromptIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [rec, setRec] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [recError, setRecError] = useState("");
  const [copyState, setCopyState] = useState<"" | "copied" | "failed">("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  // Bumped whenever results are reset, so late responses for an old clip/prompt are dropped.
  const runRef = useRef(0);

  const prompt = TEST_PROMPTS[promptIndex];

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
    setPasscode(readStoredPasscode());
  }, []);

  useEffect(() => {
    let cancelled = false;
    api("/api/providers")
      .then((r) => r.json())
      .then((m: Meta) => {
        if (cancelled) return;
        setMeta(m);
        setNeedPasscode(false);
        setRows(freshRows(m.providers));
      })
      .catch((err) => {
        if (!cancelled && !(err instanceof AuthError)) setLoadError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const resetResults = useCallback(() => {
    runRef.current++;
    setClip((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
    if (meta) setRows(freshRows(meta.providers));
    setCopyState("");
  }, [meta]);

  const goToPrompt = (i: number) => {
    if (rec !== "idle") return;
    setPromptIndex((i + TEST_PROMPTS.length) % TEST_PROMPTS.length);
    setShowAnswer(false);
    resetResults();
  };

  const updateRow = (run: number, id: string, patch: { result?: ProviderResult; grade?: GradeState }) => {
    if (run !== runRef.current) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const transcribeAll = async (wav: Blob, run: number) => {
    const targets = (meta?.providers ?? []).filter((p) => p.configured);
    await Promise.all(
      targets.map(async (row) => {
        updateRow(run, row.id, { result: { status: "loading" }, grade: { status: "idle" } });
        try {
          const form = new FormData();
          form.append("provider", row.id);
          form.append("audio", wav, "clip.wav");
          const res = await api("/api/transcribe", { method: "POST", body: form });
          const json = await res.json();
          if (!res.ok) {
            updateRow(run, row.id, { result: { status: "error", error: json.error ?? `HTTP ${res.status}`, ms: json.ms } });
          } else {
            updateRow(run, row.id, { result: { status: "done", text: json.text, note: json.note, ms: json.ms } });
          }
        } catch (err) {
          updateRow(run, row.id, { result: { status: "error", error: String(err) } });
        }
      }),
    );
  };

  const gradeRow = async (row: Row) => {
    if (row.result.status !== "done" || !row.result.text) return;
    const run = runRef.current;
    updateRow(run, row.id, { grade: { status: "loading" } });
    try {
      const res = await api("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: prompt.id, transcript: row.result.text, providerLabel: row.label }),
      });
      const json = await res.json();
      if (!res.ok) {
        updateRow(run, row.id, { grade: { status: "error", error: json.error ?? `HTTP ${res.status}` } });
      } else {
        updateRow(run, row.id, { grade: { status: "done", ...json } });
      }
    } catch (err) {
      updateRow(run, row.id, { grade: { status: "error", error: String(err) } });
    }
  };

  const gradable = rows.filter(
    (r) => r.result.status === "done" && r.result.text && r.grade.status !== "loading" && r.grade.status !== "done",
  );

  const stopTimer = () => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startRecording = async () => {
    setRecError("");
    resetResults();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setRecError(`Microphone unavailable: ${String(err)}`);
      return;
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
      const run = runRef.current;
      try {
        const { wav, seconds } = await toWav16kMono(new Blob(chunks, { type: recorder.mimeType }));
        if (run !== runRef.current) return;
        setClip({ wav, url: URL.createObjectURL(wav), seconds });
        setRec("idle");
        await transcribeAll(wav, run);
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

  const copyAll = async () => {
    const text = formatResultsText(prompt, rows, clip?.seconds ?? null);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      // Fallback for browsers without async clipboard access.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      setCopyState(ok ? "copied" : "failed");
    }
    window.setTimeout(() => setCopyState(""), 2500);
  };

  const savePasscode = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(PASSCODE_KEY, passcodeDraft);
    } catch {
      // Private mode: passcode lasts for this page load only.
    }
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

  const recordLabel = rec === "recording" ? "Stop" : rec === "processing" ? "…" : "Record";

  return (
    <main className="container">
      <header className="top">
        <h1>Kalam · voice spike</h1>
        {meta && !meta.passcodeEnabled && <p className="warn">APP_PASSCODE is not set — anyone with this URL can use your API keys.</p>}
        {meta && !meta.grader.configured && <p className="warn">ANTHROPIC_API_KEY is not set — grading is disabled.</p>}
        {loadError && <p className="warn">{loadError}</p>}
      </header>

      <section className="card prompt">
        <div className="prompt-nav">
          <button className="btn" onClick={() => goToPrompt(promptIndex - 1)} disabled={rec !== "idle"} aria-label="Previous prompt">‹</button>
          <span className="muted">
            {promptIndex + 1} / {TEST_PROMPTS.length} · {prompt.kind}
          </span>
          <button className="btn" onClick={() => goToPrompt(promptIndex + 1)} disabled={rec !== "idle"} aria-label="Next prompt">›</button>
        </div>
        <p className="prompt-en">{prompt.en}</p>
        {(prompt.referenceTranslit || prompt.tutorPartial) && (
          <button className="link" onClick={() => setShowAnswer((s) => !s)}>
            {showAnswer ? "Hide" : "Show"} {prompt.referenceTranslit ? "answer" : "tutor hint"}
          </button>
        )}
        {showAnswer && prompt.referenceTranslit && <p className="answer">{prompt.referenceTranslit}</p>}
        {showAnswer && prompt.tutorPartial && <p className="answer">Tutor started: {prompt.tutorPartial}…</p>}
      </section>

      <section className="record">
        <button
          className={`record-btn ${rec}`}
          onClick={rec === "recording" ? stopRecording : startRecording}
          disabled={rec === "processing" || !meta}
        >
          {recordLabel}
        </button>
        <p className="muted">
          {rec === "recording"
            ? `${elapsed.toFixed(1)} s / ${MAX_SECONDS} s`
            : clip
              ? `Clip: ${clip.seconds.toFixed(1)} s`
              : "Tap, say it in Levantine, tap again"}
        </p>
        {clip && <audio controls src={clip.url} className="player" />}
        {recError && <p className="warn">{recError}</p>}
      </section>

      <section className="actions">
        <button
          className="btn primary"
          disabled={gradable.length === 0 || !meta?.grader.configured}
          onClick={() => gradable.forEach(gradeRow)}
        >
          Grade all ({gradable.length})
        </button>
        <button className="btn" onClick={copyAll} disabled={!meta}>
          {copyState === "copied" ? "Copied ✓" : copyState === "failed" ? "Copy failed" : "Copy all results"}
        </button>
      </section>

      <section className="grid">
        {rows.map((row) => (
          <article key={row.id} className={`card provider ${row.result.status}`}>
            <h2>{row.label}</h2>
            <ProviderBody result={row.result} />
            {row.result.status === "done" && row.result.text && (
              <>
                {row.grade.status === "idle" && (
                  <button className="btn" onClick={() => gradeRow(row)} disabled={!meta?.grader.configured}>
                    Grade
                  </button>
                )}
                {row.grade.status === "loading" && <p className="muted">Grading…</p>}
                {row.grade.status === "error" && (
                  <>
                    <p className="warn">{row.grade.error}</p>
                    <button className="btn" onClick={() => gradeRow(row)}>Retry grade</button>
                  </>
                )}
                {row.grade.status === "done" && <GradeCard state={row.grade} />}
              </>
            )}
          </article>
        ))}
      </section>

      <footer className="muted foot">
        Grader: {meta?.grader.model ?? "…"}. Transcripts are what each system heard — not a pronunciation score.
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
