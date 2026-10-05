# Kalam — Phase 0 voice spike

One page: pick a test prompt → record (up to 60 s) → the same clip goes to every configured STT
provider → transcripts side by side → one consensus grade from Claude → copy the results as plain text.

Consensus grading combines ElevenLabs, whisper-1 and Azure (all Azure locales together are one
vote: their majority reading, or ar-JO if they disagree); gpt-4o-transcribe votes only when
switched on. Transcripts containing non-Arabic letters are discarded first, and an error only
counts if most of the remaining votes show it. Azure columns show the exact request URL, which
is also logged as `[azure-stt]` in the Vercel function logs. Practice sentences are marked against the unverified `answer_key` in the seed.
The grader toggle switches between Opus 5.5 and Sonnet 5.5; each grade shows its latency.

**Say it** (`/say`): type English → Levantine sentence (transliteration, Arabic, and a
pronunciation spelling sent to TTS) with a word-by-word breakdown → listen (loop, 0.75×,
tap a word, shadowing) → optionally record yourself for a consensus grade. Every sentence is
saved as a card; ★ = ask my tutor; saved sentences export as one MP3 with pauses.

**Voices** (`/voices`): one sentence in every configured voice, for picking the best one.

**Words** (`/words`): every concept with its forms. ★ is yours (used by Say it, answer keys and audio);
the others are accepted without penalty. One tap changes your form; a reviewer can add forms.

**Sounds** (`/sounds`): tips, audio and examples for ء ع ح خ غ ط ص and ق→2, "my weak sounds" (from
the grader's `sound_errors`), and a minimal-pair listening drill whose pairs need reviewer approval.

The spec lives in [CLAUDE.md](CLAUDE.md).

## Deploy (Vercel)

1. Import the repo in Vercel (framework preset: Next.js, no build settings to change).
2. Add the environment variables from `.env.example` (Project → Settings → Environment Variables).
   A provider with a missing key shows "not configured" instead of failing.
3. Open the preview URL on your phone. The mic requires HTTPS, which Vercel previews already use.

## Layout

```
app/page.tsx                 the one page (client)
app/api/providers            GET  provider list + configured status
app/api/transcribe           POST wav + provider id → transcript, latency
app/api/grade                POST prompt id (or ad-hoc item) + transcripts + model → grade JSON
app/api/say                  POST English → unverified card (saved to Blob)
app/api/cards                GET saved cards; PATCH/DELETE /api/cards/[id] (star, delete)
app/api/tts                  POST voice + text → MP3 (Blob-cached by voice + model + text)
app/say, app/voices          Say it page; voice test page
lib/stt/                     SttProvider interface, one file per provider, registry
lib/consensus.ts             which transcripts go into the consensus grade, majority rule
lib/grader/                  system prompt, JSON schema, model list, Claude call (retry once on bad JSON)
lib/langpacks/levantine.ts   language-specific rubric, script filter, STT settings
lib/tts/                     TtsVoice interface, Azure + ElevenLabs voices, cache
lib/say/                     Say it prompt, schema, Arabic-only output check
lib/store/                   private Vercel Blob JSON: cards, lexicon preferences, answer-key rewrites,
                             minimal pairs, sound stats (swappable for Postgres later)
lib/lexicon/                 concepts + variants, preferences, non-preferred-form detection
lib/langpacks/sounds.ts      the practice sounds, their tips and likely STT swaps
levantine_lexicon.json       built by `python3 scripts/build_lexicon.py` from the seed + scripts/lexicon_data.py
lib/client/                  browser hooks: passcode/API, recorder, TTS memo, MP3 playlist builder
lib/audio/wav.ts             browser recording → 16 kHz mono WAV (identical input for every provider)
lib/seed.ts                  the 15 test prompts, answer keys, vocab and grammar from levantine_seed.json
```

Adding an STT provider = one file implementing `SttProvider` + one line in `lib/stt/registry.ts`;
TTS voices work the same way with `TtsVoice` in `lib/tts/registry.ts`.

## Local checks

```
npm install
npm test          # unit tests
npm run typecheck
npm run build
```

`KALAM_LOCAL_BLOB_DIR=/some/folder` stores everything Blob would hold as local files (dev and tests only).
