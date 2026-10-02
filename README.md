# Kalam — Phase 0 voice spike

One page: pick a test prompt → record → the same clip goes to every configured STT provider →
transcripts side by side → grade each transcript with Claude → copy everything as plain text.

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
app/api/grade                POST prompt id + transcript → grade JSON
lib/stt/                     SttProvider interface, one file per provider, registry
lib/grader/                  system prompt, JSON schema, Claude call (retry once on bad JSON)
lib/langpacks/levantine.ts   language-specific rubric and STT settings
lib/audio/wav.ts             browser recording → 16 kHz mono WAV (identical input for every provider)
lib/seed.ts                  the 15 test prompts, vocab and grammar from levantine_seed.json
```

Adding a provider = one file implementing `SttProvider` + one line in `lib/stt/registry.ts`.

## Local checks

```
npm install
npm test          # unit tests
npm run typecheck
npm run build
```
