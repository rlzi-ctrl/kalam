"use client";

import { useCallback, useEffect, useState } from "react";
import type { Api } from "@/lib/client/useAppApi";
import type { TestPrompt } from "@/lib/seed";

type KeyInfo = {
  promptId: string;
  translit: string;
  arabic: string;
  status: string;
  rewritten: boolean;
  /** Set when the native reviewer checked it: "correct" or "edited". */
  reviewed?: string;
  stale: { concept: string; used: string; preferred: string }[];
};
type Proposal = { translit: string; arabic: string; changes: { from: string; to: string }[] };

/** The prompt's answer key in your preferred forms; rewrites need your approval before they're used. */
export function AnswerKeyPanel({ api, prompt, model }: { api: Api; prompt: TestPrompt; model: string }) {
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api("/api/answer-keys");
      const json = await res.json();
      if (res.ok) setInfo((json.keys as KeyInfo[]).find((k) => k.promptId === prompt.id) ?? null);
    } catch {
      // Fall back to the seed key below.
    }
  }, [api, prompt.id]);

  useEffect(() => {
    setProposal(null);
    setError("");
    void load();
  }, [load]);

  const propose = async () => {
    setBusy("propose");
    setError("");
    try {
      const res = await api("/api/answer-keys/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: prompt.id, model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setProposal(json.proposed);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy("");
    }
  };

  const approve = async () => {
    if (!proposal) return;
    setBusy("approve");
    try {
      const res = await api("/api/answer-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: prompt.id, translit: proposal.translit, arabic: proposal.arabic }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setProposal(null);
      await load();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy("");
    }
  };

  const key = info ?? (prompt.answerKey ? { ...prompt.answerKey, rewritten: false, stale: [] } : null);
  if (!key) return null;

  return (
    <div className="answer">
      <span className="tag">
        answer key · {key.status}
        {"reviewed" in key && key.reviewed ? (key.reviewed === "edited" ? " · corrected by reviewer" : " · checked by reviewer") : key.rewritten ? " · rewritten" : ""}
      </span>
      <p>{key.translit}</p>
      <p className="arabic" dir="rtl" lang="ar">{key.arabic}</p>
      {key.stale.length > 0 && !proposal && (
        <div className="pref-notice small">
          <p>Uses {key.stale.map((s) => `${s.used} (you prefer ${s.preferred})`).join(", ")}.</p>
          <button className="btn" onClick={propose} disabled={busy !== ""}>
            {busy === "propose" ? "Rewriting…" : "Update key"}
          </button>
        </div>
      )}
      {proposal && (
        <div className="pref-notice small">
          <p><strong>Proposed key</strong> (nothing changes until you approve):</p>
          <p className="diff-old">− {key.translit}</p>
          <p className="diff-new">+ {proposal.translit}</p>
          <p className="diff-old" dir="rtl" lang="ar">− {key.arabic}</p>
          <p className="diff-new" dir="rtl" lang="ar">+ {proposal.arabic}</p>
          {proposal.changes.length > 0 && <p className="muted">{proposal.changes.map((c) => `${c.from} → ${c.to}`).join(" · ")}</p>}
          <button className="btn primary" onClick={approve} disabled={busy !== ""}>
            {busy === "approve" ? "Saving…" : "Approve"}
          </button>{" "}
          <button className="btn" onClick={() => setProposal(null)} disabled={busy !== ""}>Discard</button>
        </div>
      )}
      {error && <p className="warn small">{error}</p>}
    </div>
  );
}
