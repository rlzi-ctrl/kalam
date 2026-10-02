# Kalam — Project spec

### Goal
A do-it-at-your-own-pace speaking coach for an English speaker learning **Levantine Arabic** (first) and **Spanish** (second). The core loop is *speak or type a sentence → get scored and corrected → retry → mistakes come back later*. On top of that, an AI **persona** you can hold an open conversation with, restricted to vocabulary you actually know. Personal use first; designed so it could become multi-user later.

### Non-negotiables
1. **Transliteration-first for Arabic.** The learner writes Latin-script Arabizi (e.g. `ana barooh 3al mat3am`), never Arabic script. Accept common variant spellings: 3=ع, 7=ح, 2=ء, 5/kh=خ, gh=غ, doubled vowels, ee/i, oo/u/o, hyphens vs spaces, optional `al-`/`il-`. Grade *meaning and dialect correctness*, not spelling. Store every item canonically in Arabic script + a preferred transliteration + accepted variants.
2. **Levantine, not MSA.** If the learner uses an MSA form (e.g. `ila`, `hatha`), mark it "understandable but MSA" and give the Levantine form — don't mark it wrong outright.
3. **Teach the b- present prefix.** Statements: `ana barooh`, `howa byakol`. Bare form after `bedi / lazem / rah / ba3ref`. Accept learner's bare form in early lessons with a gentle note.
4. **Curriculum-constrained.** The persona and the drills use only words from lessons the learner has unlocked, plus at most 1–2 new words per turn (shown with a gloss). The vocab list is the source of truth.
5. **Honest pronunciation scoring.** Speech-to-text tends to auto-correct a learner's mistakes into proper Arabic. Never present an STT-based number as a precise pronunciation score. Show: what the system heard, the target, and a qualitative note. A dedicated pronunciation score only for languages where a real pronunciation-assessment API is available (Spanish yes; Arabic only if the Phase 0 spike shows it works).
6. **Language packs.** Everything language-specific (normalizer rules, grader rubric notes, personas, voices, STT/TTS provider choice) lives in a per-language config so Spanish is a config + content addition, not a rewrite.

### Modes (MVP = 1, 2, 4; then 3)
1. **Speak drill** — English prompt → learner speaks → STT → LLM grader → feedback card (score per dimension, corrected sentence in transliteration + Arabic script, native audio of the model answer via TTS) → "try again" until ≥ threshold. Misses go to the mistake bank.
2. **Write drill** — same, typed Arabizi. Run a deterministic normalizer before the LLM grader.
3. **Persona conversation** — voice chat with a persona (e.g. *Rami, taxi driver in Amman*; *Lina, colleague at the office*; *Abu Khaled, shop owner*; *neighbour inviting you for coffee*). Persona stays in character, speaks slowly, uses known vocab, asks follow-up questions. Learner can tap "help" for an English hint. Corrections are collected silently and shown in an **end-of-session report** (overall score, top 3 errors, new words used, sentences to drill). Optional toggle: correct after every turn.
4. **Mistake bank + spaced repetition** — every corrected item becomes a review card (SM-2 or FSRS). Daily session = due reviews + 5 new sentences + optional 5-minute persona chat.
6. **Say it (reverse direction)** — type English → Claude returns `translit` (seed spellings), `arabic`, `tts_spelling` (Arabic script spelled as Levantine is pronounced, e.g. أديمة for قديمة, used as the TTS input) and a word-by-word breakdown, status "unverified". Player: loop, 0.75×, tap a word, shadowing (play → pause to repeat → replay), optional recorded attempt graded by consensus. Every sentence is saved as a review card; ★ marks "ask my tutor"; saved sentences export as one MP3 playlist with pauses. TTS sits behind a provider interface like STT (Azure ar-JO/LB/SY, ElevenLabs); audio is cached in Vercel Blob keyed by voice + model + text. The voice test page (/voices) is for the tutor to pick a voice.
5. **Add lesson** — paste raw tutor notes → LLM structures them into the seed format → review screen where I approve/edit before they go live. Flag likely errors instead of silently fixing them.

### Grader output (strict JSON)
```json
{
  "meaning": 0-100,            // did they convey the English prompt
  "grammar": 0-100,            // conjugation, pronoun suffixes, gender agreement, b- prefix
  "vocabulary": 0-100,         // right word choice, Levantine vs MSA
  "fluency_note": "string",    // from audio: hesitations, length; qualitative only for Arabic
  "heard": "string",           // what STT returned (speak mode)
  "corrected_translit": "string",
  "corrected_arabic": "string",
  "errors": [{"type": "conjugation|suffix|gender|msa_form|word_choice|word_order|missing_word", "learner": "...", "fix": "...", "tip": "one short sentence"}],
  "overall": 0-100,
  "encouragement": "one short line",
  "consensus_note": "string"   // where STT transcripts agreed, which disagreements were treated as noise
}
```
Pass the grader: target English, the answer key (or any tutor partial answer) from the seed, the learner's unlocked vocab, the language pack's rubric notes, and the normalized learner input. Temperature low. Validate JSON; retry once on parse failure.

**Consensus grading (from Phase 0 results).** No single STT is reliable; agreement between providers is the signal. Speak mode sends one clip to ElevenLabs Scribe, whisper-1 and gpt-4o-transcribe, discards any transcript with non-Arabic letters (Latin, or Persian/Urdu letters such as ک ی ے ھ), and makes one grader call with the rest. An error counts against the learner only if most remaining transcripts show it; otherwise it is STT noise.

**Answer key.** Each practice sentence has one canonical Levantine `answer_key` (translit + Arabic) in the seed. The grader marks against it and uses its exact spellings. Keys start as `"status": "unverified"` until the tutor confirms them.

### Suggested stack (open to Claude Code's recommendation)
- Next.js (App Router) + TypeScript, installable as a PWA so it works on my phone browser without app stores.
- SQLite (local) for Phase 1; schema compatible with Postgres/Supabase for later multi-user.
- LLM: Claude API for persona + grader. STT/TTS behind provider interfaces; candidates to test in Phase 0: ElevenLabs Scribe, OpenAI transcription, Azure Speech (ar-JO / ar-LB / ar-SY locales), and a speech-to-speech realtime model as the alternative path for persona mode.
- Log per-session cost (STT minutes, TTS characters, LLM tokens) from day one — this is the number that decides whether monetization works.

### Data model (minimum)
`language`, `lesson`, `vocab_item(canonical_ar, translit, variants[], en, lesson_id, status)`, `sentence(en, target_translit?, target_ar?, lesson_id)`, `attempt(item_id, mode, input, heard, grade_json, created_at)`, `review_card(item_id, due_at, ease, interval)`, `persona`, `conversation(persona_id, transcript, report_json)`.

### Phases
- **Phase 0 — voice spike** (see prompt above). Exit: we know which STT gives usable transcripts for my voice, and the grader output looks right on 15 sentences.
- **Phase 1 — personal MVP**: modes 1, 2, 4 with seed data; daily session screen; progress chart.
- **Phase 2 — persona conversations** + end-of-session report.
- **Phase 3 — add-lesson importer** + Spanish language pack.
- **Phase 4 — multi-user**: auth, per-user vocab, usage caps, Stripe, tutor-share link.

### Working agreements
- Small, reviewable steps; run and show me each feature before moving on.
- Never hard-code API keys. Never auto-correct seed data without showing me the diff.
- Write tests for the transliteration normalizer (it's the piece most likely to have bugs).
