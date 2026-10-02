# Kalam — Phase 0 voice spike

One page: pick a test prompt → record (up to 60 s) → the same clip goes to every configured STT
provider → transcripts side by side → one consensus grade from Claude → copy the results as plain text.

Consensus grading combines ElevenLabs, whisper-1 and gpt-4o-transcribe. Transcripts containing
non-Arabic letters are discarded first, and an error only counts if most of the remaining
transcripts show it. Practice sentences are marked against the unverified `answer_key` in the seed.
The grader toggle switches between Opus 5.5 and Sonnet 5.5; each grade shows its latency.

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
app/api/grade                POST prompt id + transcripts + model → consensus (or single) grade JSON
lib/stt/                     SttProvider interface, one file per provider, registry
lib/consensus.ts             which transcripts go into the consensus grade, majority rule
lib/grader/                  system prompt, JSON schema, model list, Claude call (retry once on bad JSON)
lib/langpacks/levantine.ts   language-specific rubric, script filter, STT settings
lib/audio/wav.ts             browser recording → 16 kHz mono WAV (identical input for every provider)
lib/seed.ts                  the 15 test prompts, answer keys, vocab and grammar from levantine_seed.json
```

Adding a provider = one file implementing `SttProvider` + one line in `lib/stt/registry.ts`.

## Local checks

```
npm install
npm test          # unit tests
npm run typecheck
npm run build
```
