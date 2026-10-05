"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PasscodeScreen } from "@/components/PasscodeScreen";
import { recordingToMp3 } from "@/lib/audio/mp3";
import { readStored, writeStored } from "@/lib/client/prefs";
import { useRecorder } from "@/lib/client/useRecorder";
import type { ReviewItem } from "@/lib/store/review";

const PASSCODE_KEY = "kalam_reviewer_passcode";
const MAX_SECONDS = 60;

type Draft = { id: string; blob: Blob; url: string };

/** For the native reviewer: check each answer-key sentence, fix it, or record it. */
export default function ReviewPage() {
  const [passcode, setPasscode] = useState("");
  const [needPasscode, setNeedPasscode] = useState(false);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [dialect, setDialect] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const [editing, setEditing] = useState<{ id: string; translit: string; arabic: string; note: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  // Sentences worked on in this visit stay in "Still to do" until reload, so a reviewer can play back what they saved.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const recorder = useRecorder(MAX_SECONDS);
  const passcodeRef = useRef("");
  passcodeRef.current = passcode;

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("x-reviewer-passcode", passcodeRef.current);
    const res = await fetch(path, { ...init, headers });
    if (res.status === 401) setNeedPasscode(true);
    return res;
  }, []);

  const load = useCallback(async () => {
    const res = await api("/api/review");
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) return;
    if (!res.ok) return setError(json.error ?? `HTTP ${res.status}`);
    setNeedPasscode(false);
    setItems(json.items);
    setDialect(json.dialect);
  }, [api]);

  useEffect(() => {
    setPasscode(readStored(PASSCODE_KEY));
  }, []);
  useEffect(() => {
    void load();
  }, [passcode, load]);

  const replace = (item: Partial<ReviewItem> & { id: string }) => {
    setTouched((t) => new Set(t).add(item.id));
    setItems((xs) => xs?.map((x) => (x.id === item.id ? { ...x, ...item } : x)) ?? null);
  };

  const act = async (item: ReviewItem, body: Record<string, unknown>) => {
    setBusy(item.id);
    setError("");
    try {
      const res = await api(`/api/review/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const recording = item.recording && { ...item.recording, matchesKey: item.recording.matchesKey && json.key.arabic === item.arabic };
      replace({ id: item.id, translit: json.key.translit, arabic: json.key.arabic, status: json.key.status, review: json.key.review, recording });
      setEditing(null);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy("");
    }
  };

  const playUrl = async (item: ReviewItem) => {
    if (audioUrls[item.id]) return audioUrls[item.id];
    const res = await api(`/api/review/${item.id}/audio`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    setAudioUrls((u) => ({ ...u, [item.id]: url }));
    return url;
  };

  const startRecording = async (item: ReviewItem) => {
    setError("");
    setDraft(null);
    setRecordingId(item.id);
    const ok = await recorder.start(async ({ raw }) => {
      try {
        const blob = await recordingToMp3(raw);
        setDraft({ id: item.id, blob, url: URL.createObjectURL(blob) });
      } catch (err) {
        setError(`Could not prepare the recording: ${String(err)}`);
      }
      setRecordingId(null);
    });
    if (!ok) setRecordingId(null);
  };

  const saveDraft = async (item: ReviewItem) => {
    if (!draft) return;
    setBusy(item.id);
    try {
      const form = new FormData();
      form.append("audio", draft.blob, "recording.mp3");
      const res = await api(`/api/review/${item.id}/audio`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      replace({ id: item.id, recording: json.recording });
      setAudioUrls((u) => ({ ...u, [item.id]: draft.url }));
      setDraft(null);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy("");
    }
  };

  const deleteAudio = async (item: ReviewItem) => {
    if (!window.confirm("Delete this recording?")) return;
    const res = await api(`/api/review/${item.id}/audio`, { method: "DELETE" });
    if (!res.ok) return setError(`Delete failed: HTTP ${res.status}`);
    replace({ id: item.id, recording: undefined });
    setAudioUrls(({ [item.id]: _, ...rest }) => rest);
  };

  if (needPasscode || (!items && !error && !passcode)) {
    return (
      <PasscodeScreen
        nav={false}
        title="Kalam · review"
        hint="Enter the reviewer passcode you were given."
        tried={Boolean(passcode) && needPasscode}
        onSubmit={(v) => {
          writeStored(PASSCODE_KEY, v);
          setPasscode(v);
        }}
      />
    );
  }

  const checked = items?.filter((i) => i.review).length ?? 0;
  const recorded = items?.filter((i) => i.recording?.matchesKey).length ?? 0;
  const shown = items?.filter((i) => filter === "all" || touched.has(i.id) || !i.review || !i.recording?.matchesKey) ?? [];

  return (
    <main className="container review">
      <h1>Kalam · review</h1>
      <p className="small">
        Thank you for helping! These are practice sentences for a learner of <strong>{dialect || "Levantine Arabic"}</strong>.
        For each one: tap <strong>Correct</strong> if it&apos;s what you&apos;d say, <strong>Edit</strong> to fix it, and
        <strong> Record</strong> to say it in your own voice. Your recording is what the learner will hear.
      </p>
      {items && (
        <p className="small muted">
          {checked} of {items.length} checked · {recorded} recorded
        </p>
      )}
      {error && <p className="warn">{error}</p>}
      <div className="review-filter">
        <button className={`seg ${filter === "todo" ? "on" : ""}`} onClick={() => setFilter("todo")}>Still to do</button>
        <button className={`seg ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All</button>
      </div>
      {items && shown.length === 0 && <p className="encourage">All done — every sentence is checked and recorded. 🙏</p>}

      {shown.map((item) => {
        const isEditing = editing?.id === item.id;
        const isRecording = recordingId === item.id && recorder.rec !== "idle";
        const hasDraft = draft?.id === item.id;
        return (
          <article key={item.id} className="card review-item">
            <p className="muted small">English</p>
            <p className="review-en">{item.en}</p>
            {!isEditing ? (
              <>
                <p className="arabic-big" dir="rtl" lang="ar">{item.arabic}</p>
                <p className="translit-big">{item.translit}</p>
              </>
            ) : (
              <div className="review-edit">
                <label className="small">Arabic</label>
                <textarea dir="rtl" lang="ar" rows={2} value={editing.arabic} onChange={(e) => setEditing({ ...editing, arabic: e.target.value })} />
                <label className="small">Transliteration (Latin letters, e.g. ana bedi aroh 3al bahar)</label>
                <textarea rows={2} value={editing.translit} onChange={(e) => setEditing({ ...editing, translit: e.target.value })} />
                <label className="small">Note for the learner (optional)</label>
                <input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
              </div>
            )}

            {item.learnerChoices.length > 0 && (
              <p className="small muted">
                On purpose: {item.learnerChoices.map((c) => `${c.translit} (${c.en}, ${c.register})`).join(", ")} — the
                learner&apos;s own word from their lessons. Only change it if it&apos;s actually wrong.
              </p>
            )}
            <p className="small">
              {item.review ? (
                <span className="encourage">
                  {item.review.action === "correct" ? "✓ Marked correct" : "✎ Edited"} · {new Date(item.review.at).toLocaleDateString()}
                </span>
              ) : (
                <span className="tag">to check</span>
              )}
              {item.review?.note && <span className="muted"> · “{item.review.note}”</span>}
            </p>

            <div className="review-actions">
              {isEditing ? (
                <>
                  <button
                    className="btn primary"
                    disabled={busy === item.id || !editing.arabic.trim() || !editing.translit.trim()}
                    onClick={() => act(item, { action: "edit", translit: editing.translit, arabic: editing.arabic, note: editing.note })}
                  >
                    Save
                  </button>
                  <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button className="btn primary" disabled={busy === item.id} onClick={() => act(item, { action: "correct" })}>
                    ✓ Correct
                  </button>
                  <button className="btn" onClick={() => setEditing({ id: item.id, translit: item.translit, arabic: item.arabic, note: item.review?.note ?? "" })}>
                    ✎ Edit
                  </button>
                  <button
                    className={`btn ${isRecording ? "rec-on" : ""}`}
                    disabled={(recordingId !== null && recordingId !== item.id) || recorder.rec === "processing" || busy === item.id}
                    onClick={isRecording ? recorder.stop : () => startRecording(item)}
                  >
                    {isRecording
                      ? recorder.rec === "processing"
                        ? "…"
                        : `■ Stop (${recorder.elapsed.toFixed(0)} s)`
                      : item.recording
                        ? "🎙 Record again"
                        : "🎙 Record"}
                  </button>
                </>
              )}
            </div>

            {hasDraft && (
              <div className="pref-notice small">
                <p>Listen back, then save:</p>
                <audio controls src={draft.url} className="player" />
                <button className="btn primary" disabled={busy === item.id} onClick={() => saveDraft(item)}>
                  {busy === item.id ? "Saving…" : "Save recording"}
                </button>{" "}
                <button className="btn" onClick={() => setDraft(null)}>Discard</button>
              </div>
            )}
            {item.recording && !hasDraft && (
              <div className="small review-recording">
                <RecordingPlayer item={item} getUrl={playUrl} />
                {!item.recording.matchesKey && <p className="warn">Recorded before the sentence was edited — please record it again.</p>}
                <button className="link small" onClick={() => deleteAudio(item)}>Delete recording</button>
              </div>
            )}
            {recorder.error && recordingId === item.id && <p className="warn small">{recorder.error}</p>}
          </article>
        );
      })}
    </main>
  );
}

function RecordingPlayer({ item, getUrl }: { item: ReviewItem; getUrl: (item: ReviewItem) => Promise<string> }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  if (url) return <audio controls autoPlay src={url} className="player" />;
  return (
    <>
      <button className="link" onClick={() => getUrl(item).then(setUrl).catch((e) => setError(String(e)))}>
        ▶ Your recording
      </button>
      {error && <span className="warn"> {error}</span>}
    </>
  );
}
