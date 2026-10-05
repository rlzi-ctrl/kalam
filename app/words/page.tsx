"use client";

import { useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { PasscodeScreen } from "@/components/PasscodeScreen";
import { VOICE_KEY, readStored } from "@/lib/client/prefs";
import { useAppApi } from "@/lib/client/useAppApi";
import { useLexicon } from "@/lib/client/useLexicon";
import { useTts } from "@/lib/client/useTts";
import type { Concept, Register } from "@/lib/lexicon";

const REGISTERS: Register[] = ["levantine", "msa", "regional"];

/** Your forms vs. the forms you'll also hear: browse, pick your preferred form, add a reviewer form. */
export default function WordsPage() {
  const { api, meta, loadError, needPasscode, passcodeTried, submitPasscode } = useAppApi();
  const lexicon = useLexicon(api, Boolean(meta));
  const getSpeech = useTts(api);
  const [query, setQuery] = useState("");
  const [onlyVariants, setOnlyVariants] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState({ translit: "", arabic: "", register: "levantine" as Register });
  const [error, setError] = useState("");

  const voiceId = useMemo(() => {
    const usable = meta?.voices.filter((v) => v.configured) ?? [];
    const stored = typeof window === "undefined" ? "" : readStored(VOICE_KEY);
    return usable.some((v) => v.id === stored) ? stored : (usable[0]?.id ?? "");
  }, [meta]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lexicon.concepts.filter(
      (c) =>
        (!onlyVariants || c.variants.length > 1 || c.review_flag) &&
        (!q || c.en.toLowerCase().includes(q) || c.variants.some((v) => v.translit.includes(q) || v.arabic.includes(q))),
    );
  }, [lexicon.concepts, query, onlyVariants]);

  const play = async (text: string) => {
    if (!voiceId) return;
    try {
      const clip = await getSpeech(voiceId, text);
      await new Audio(clip.url).play();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  };

  const saveDraft = (c: Concept) =>
    run(async () => {
      await lexicon.add({ conceptId: c.id, forms: [{ ...draft, source: "reviewer" }] });
      setAdding(null);
      setDraft({ translit: "", arabic: "", register: "levantine" });
    });

  if (needPasscode) return <PasscodeScreen tried={passcodeTried} onSubmit={submitPasscode} />;

  return (
    <main className="container">
      <Nav />
      <h1>My words</h1>
      <p className="muted small">
        Say mine, recognise theirs: ★ is the form Kalam uses with you (Say it, answer keys, audio). Every other form
        listed is accepted with no penalty.
      </p>
      {loadError && <p className="warn">{loadError}</p>}
      {lexicon.error && <p className="warn">{lexicon.error}</p>}
      {meta && !lexicon.storageConfigured && <p className="warn">BLOB_READ_WRITE_TOKEN is not set — preferences can&apos;t be saved.</p>}
      {error && <p className="warn">{error}</p>}

      <div className="card words-filter">
        <input type="search" placeholder="Search English, transliteration or Arabic" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="small">
          <input type="checkbox" checked={onlyVariants} onChange={(e) => setOnlyVariants(e.target.checked)} /> Only words with other forms or a tutor flag
        </label>
        <p className="muted small">{shown.length} of {lexicon.concepts.length}</p>
      </div>

      <ul className="concept-list">
        {shown.map((c) => (
          <li key={c.id} className="card">
            <p className="concept-en">
              {c.en} <span className="muted small">{c.lesson ? `L${c.lesson}` : c.id.startsWith("p-") ? "phrase" : "added"}</span>
            </p>
            {c.review_flag && <p className="small warn">Tutor flag: {c.review_flag}</p>}
            {c.note && <p className="small muted">{c.note}</p>}
            <ul className="variant-list">
              {c.variants.map((v) => (
                <li key={v.id} className={v.preferred ? "on" : ""}>
                  <button
                    className={`star ${v.preferred ? "on" : ""}`}
                    aria-pressed={v.preferred}
                    aria-label={v.preferred ? "Your preferred form" : `Make ${v.translit} my form`}
                    disabled={v.preferred || !lexicon.storageConfigured}
                    onClick={() => run(() => lexicon.prefer(c.id, v.id))}
                  >
                    {v.preferred ? "★" : "☆"}
                  </button>
                  <button className="link variant-play" onClick={() => play(v.tts ?? v.arabic)} disabled={!voiceId}>
                    ▶ <span className="variant-tr">{v.translit}</span> <span dir="rtl" lang="ar">{v.arabic}</span>
                  </button>
                  <span className="tag">{v.register}</span> <span className="tag">{v.source}</span>
                </li>
              ))}
            </ul>
            {lexicon.storageConfigured &&
              (adding === c.id ? (
                <div className="add-variant">
                  <input placeholder="translit (e.g. ashab)" value={draft.translit} onChange={(e) => setDraft({ ...draft, translit: e.target.value })} />
                  <input placeholder="Arabic" dir="rtl" lang="ar" value={draft.arabic} onChange={(e) => setDraft({ ...draft, arabic: e.target.value })} />
                  <select value={draft.register} onChange={(e) => setDraft({ ...draft, register: e.target.value as Register })}>
                    {REGISTERS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <button className="btn primary" disabled={!draft.translit.trim() || !draft.arabic.trim()} onClick={() => saveDraft(c)}>Add (as reviewer)</button>
                  <button className="btn" onClick={() => setAdding(null)}>Cancel</button>
                </div>
              ) : (
                <button className="link small" onClick={() => setAdding(c.id)}>+ add a form</button>
              ))}
          </li>
        ))}
      </ul>
    </main>
  );
}
