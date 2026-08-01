# CommentlyAI

Your voice. At scale.

A lean web applet for LinkedIn creators: paste a post, get a specific, tone-matched, human-sounding comment, and keep a log of everything you've generated.

## Run it

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## API keys

Comment generation calls Claude first, then falls back to Gemini on failure/timeout/rate limit. Set these before generating real comments:

```bash
# macOS/Linux
export CLAUDE_API_KEY=sk-ant-...
export GEMINI_API_KEY=...

# Windows PowerShell
$env:CLAUDE_API_KEY = "sk-ant-..."
$env:GEMINI_API_KEY = "..."
```

Without keys set, the generator fails gracefully with a clear error — the app itself still runs.

Optional overrides: `PORT`, `CLAUDE_MODEL` (default `claude-sonnet-5`), `GEMINI_MODEL` (default `gemini-2.5-flash`).

## Scope

MVP features: Context Selector (5 presets + custom), Comment Generator (Claude → Gemini failover), Creator/Post Log (localStorage, reverse-chronological, revisit flag). A LinkedIn scraping integration is scaffolded at `POST /api/scrape-post` but disabled by default — no provider chosen yet.
