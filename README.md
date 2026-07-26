# CommentlyAI — MVP

Tone-matched LinkedIn comment generator. Paste a post, pick a context, get a comment in your voice.

## Run it

```bash
npm install
CLAUDE_API_KEY=sk-ant-... GEMINI_API_KEY=... npm start
```

Then open http://localhost:3000

Both env vars are optional to *start* the server, but generation will fail without at least `CLAUDE_API_KEY` (Gemini is the fallback if Claude fails/times out).

**Important:** run it with `npm start`, then open **http://localhost:3000**. Don't open `public/index.html` directly or serve it with something like VSCode's Live Server — the frontend calls `/api/generate` on the same origin, and that route only exists on the Express server, not a static file server. If you do this, every generate click will fail immediately with no useful error.

## Troubleshooting

The server now gives specific error messages instead of a generic failure:
- **No keys set at all** → fails immediately (no wasted wait) with a message telling you to set `CLAUDE_API_KEY`.
- **Claude key invalid/missing, no Gemini key** → shows Claude's actual error and tells you no fallback is configured.
- **Both configured, both fail** → shows both providers' actual error messages.

Check your terminal running `npm start` too — it logs which keys are configured on startup, and logs the real error from each provider as it happens.

## What's here

- `server.js` — Express server. Single `/api/generate` route calls Claude first, falls back to Gemini once on failure/timeout. API keys never reach the client.
- `public/index.html` — the whole frontend: Base Voice inputs, Context Selector (5 presets + custom), Comment Generator, and the Creator/Post Log. All state persists to `localStorage`.
- `scrapeLinkedInPost()` in `server.js` — a stubbed, unwired scaffold for a future LinkedIn scraping integration. Throws "not implemented" if called. No provider chosen yet.

## Known MVP limitations (by design, see build decisions)

- Manual paste-in only — no live scraping yet.
- No accounts/auth — single-user, data lives in the browser's localStorage.
- No editing/deleting Context Selector presets, only adding new ones.
- Log is a flat reverse-chronological list — no search or filtering.
- No `.env` file wiring — set env vars directly in your shell/process manager for now.
