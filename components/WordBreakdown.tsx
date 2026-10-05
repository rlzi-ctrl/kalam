"use client";

import { useState } from "react";
import type { SoundId } from "@/lib/langpacks/sounds";
import { containsForm, preferredVariant, type Concept, type Register } from "@/lib/lexicon";
import type { NewForm } from "@/lib/client/useLexicon";
import type { SayWord } from "@/lib/say/schema";
import { SoundLetters } from "./SoundLetters";
import { SoundTip } from "./SoundTip";

/** A form the learner might also hear: from the lexicon, or suggested with the sentence. */
type AlsoForm = {
  key: string;
  translit: string;
  arabic: string;
  tts: string;
  register: Register;
  origin: "lexicon" | "suggested";
  variantId?: string;
  /** The learner's preferred form of this concept. */
  preferred?: boolean;
};

export type LexiconActions = {
  storageConfigured: boolean;
  prefer: (conceptId: string, variantId: string) => Promise<Concept>;
  add: (opts: { conceptId?: string; en?: string; forms: (NewForm & { source?: "generated" | "reviewer" })[]; prefer?: string }) => Promise<Concept>;
};

/**
 * Other forms of a word: the concept's other variants plus suggestions the lexicon doesn't have yet.
 * Lexicon forms are offered only when the word visibly uses one of the concept's forms; an inflected
 * verb (bahki for "ana ahki") matches none, and its "alternatives" would just be the same verb.
 */
export function alsoHeard(word: SayWord, concept: Concept | undefined): AlsoForm[] {
  const used = concept?.variants.some((v) => containsForm(word.translit, v.translit)) ?? false;
  const lexicon: AlsoForm[] = (used ? concept!.variants : [])
    .filter((v) => !containsForm(word.translit, v.translit))
    .map((v) => ({ key: v.id, translit: v.translit, arabic: v.arabic, tts: v.tts ?? v.arabic, register: v.register, origin: "lexicon", variantId: v.id, preferred: v.preferred }));
  const suggested: AlsoForm[] = (word.other_forms ?? [])
    .filter((f) => !concept?.variants.some((v) => containsForm(f.translit, v.translit)))
    .map((f) => ({ key: `s:${f.translit}`, translit: f.translit, arabic: f.arabic, tts: f.arabic, register: f.register, origin: "suggested" }));
  return [...lexicon, ...suggested];
}

export function WordBreakdown({
  words,
  concepts,
  activeWord,
  onPlayWord,
  onPlayText,
  lexicon,
  onPreferred,
}: {
  words: SayWord[];
  concepts: Concept[];
  activeWord: number | null;
  onPlayWord: (i: number) => void;
  onPlayText: (text: string) => void;
  lexicon?: LexiconActions;
  /** Called after a preference changes, e.g. to offer re-generating the sentence. */
  onPreferred?: (message: string) => void;
}) {
  const [tip, setTip] = useState<SoundId | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const conceptOf = (w: SayWord) => concepts.find((c) => c.id === w.concept_id);

  const makeMine = async (word: SayWord, form: AlsoForm) => {
    if (!lexicon) return;
    setBusy(form.key);
    setError("");
    try {
      const concept = conceptOf(word);
      const saved =
        form.origin === "lexicon" && concept && form.variantId
          ? await lexicon.prefer(concept.id, form.variantId)
          : await lexicon.add({
              conceptId: concept?.id,
              en: concept ? undefined : word.en,
              // A new concept also keeps the form this sentence used, so it stays recognised.
              forms: [
                ...(concept ? [] : [{ translit: word.translit, arabic: word.arabic, register: "levantine" as Register, tts: word.tts_spelling, source: "generated" as const }]),
                { translit: form.translit, arabic: form.arabic, register: form.register, source: "generated" },
              ],
              prefer: form.translit,
            });
      onPreferred?.(`From now on you'll get ${preferredVariant(saved).translit} for "${saved.en}".`);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy("");
    }
  };

  const withAlso = words.map((w, i) => ({ w, i, also: alsoHeard(w, conceptOf(w)) })).filter((x) => x.also.length > 0);

  return (
    <>
      <div className="words" dir="rtl" lang="ar">
        {words.map((w, i) => (
          <button
            key={i}
            className={`word ${activeWord === i ? "on" : ""} ${w.known ? "" : "new"}`}
            onClick={() => onPlayWord(i)}
            title={w.en}
          >
            <span className="word-ar">
              <SoundLetters text={w.arabic} onSound={setTip} />
            </span>
            <span className="word-tr" dir="ltr">{w.translit}</span>
            <span className="word-en" dir="ltr">{w.en}</span>
          </button>
        ))}
      </div>
      <p className="muted small">
        Tap a word to hear it alone, or a <span className="snd">coloured letter</span> for how to say it. Dashed words
        aren&apos;t in your vocab list yet.
      </p>
      {tip && <SoundTip id={tip} onClose={() => setTip(null)} />}

      {withAlso.length > 0 && (
        <div className="also">
          <p className="small"><strong>You&apos;ll also hear</strong></p>
          <ul>
            {withAlso.map(({ w, i, also }) => (
              <li key={i}>
                <span className="also-word">{w.translit}</span>
                {also.map((f) => (
                  <span key={f.key} className="also-chip">
                    <button className="link" onClick={() => onPlayText(f.tts)} aria-label={`Play ${f.translit}`}>
                      ▶ {f.translit} <span dir="rtl" lang="ar">{f.arabic}</span>
                    </button>
                    <span className="tag">{f.register}{f.origin === "suggested" ? " · suggested" : ""}</span>
                    {f.preferred ? (
                      <span className="small mine">★ mine</span>
                    ) : lexicon?.storageConfigured && (
                      <button className="link small" disabled={busy === f.key} onClick={() => makeMine(w, f)}>
                        {busy === f.key ? "…" : "make mine"}
                      </button>
                    )}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          {error && <p className="warn small">{error}</p>}
        </div>
      )}
    </>
  );
}
