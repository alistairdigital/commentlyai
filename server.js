// CommentlyAI — MVP server
// Single-file Node + Express app. Serves the static frontend and handles
// comment generation server-side so API keys never reach the client.

const path = require('path');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// LLM clients
// ---------------------------------------------------------------------------
// API key storage is deferred per MVP decisions — these read straight from
// process.env. No .env loading / config UI is wired up yet.

const REQUEST_TIMEOUT_MS = 15000;

const CLAUDE_KEY_CONFIGURED = Boolean(process.env.CLAUDE_API_KEY && process.env.CLAUDE_API_KEY.trim());
const GEMINI_KEY_CONFIGURED = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  timeout: REQUEST_TIMEOUT_MS,
});

const genAI = CLAUDE_KEY_CONFIGURED || GEMINI_KEY_CONFIGURED
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const CLAUDE_MODEL = 'claude-sonnet-5';
const GEMINI_MODEL = 'gemini-2.0-flash';

// Loud startup warning so a missing-key situation is obvious in the terminal,
// not just as a generic failure in the browser.
if (!CLAUDE_KEY_CONFIGURED && !GEMINI_KEY_CONFIGURED) {
  console.warn(
    '\n[CommentlyAI] WARNING: Neither CLAUDE_API_KEY nor GEMINI_API_KEY is set.\n' +
    '  Comment generation will fail until at least CLAUDE_API_KEY is set.\n' +
    '  Example: CLAUDE_API_KEY=sk-ant-... npm start\n'
  );
} else {
  console.log(
    `[CommentlyAI] Claude key: ${CLAUDE_KEY_CONFIGURED ? 'configured' : 'MISSING'} | ` +
    `Gemini key: ${GEMINI_KEY_CONFIGURED ? 'configured' : 'MISSING'}`
  );
}

// Generic timeout wrapper — the Gemini SDK doesn't expose a request timeout
// option directly, so we race it against a manual timer. Without this, an
// unreachable or slow fallback provider could hang a request indefinitely.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// Scraping API scaffold (NOT wired up — disabled by default)
// ---------------------------------------------------------------------------
// This is intentionally a stub. No third-party LinkedIn scraping provider has
// been chosen yet. When one is picked, implement the fetch/parse logic here
// and wire a route to it — the rest of the app should not need to change.
async function scrapeLinkedInPost(/* postUrl */) {
  throw new Error(
    'scrapeLinkedInPost() is not implemented yet — this is a scaffold for a future ' +
    'third-party LinkedIn scraping integration. MVP only supports manual paste-in.'
  );
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------
function buildPrompt({ postText, context, baseVoice }) {
  const [adj1, adj2, adj3] = baseVoice;
  return `You write LinkedIn engagement comments for a creator with a consistent base voice, adapted in register to fit the context of whatever post they're responding to.

BASE VOICE (always constant): ${adj1}, ${adj2}, ${adj3}

CONTEXT FOR THIS COMMENT:
- Creator Type: ${context.creatorType}
- Industry/Niche: ${context.industry}
- Voice Profile (register for this context): ${context.voiceProfile}

THE POST TO COMMENT ON:
"""
${postText}
"""

Write ONE LinkedIn comment that:
- Is specific to what this post actually says — reference an actual detail, claim, or choice made in the post, not generic praise
- Sounds like a knowledgeable human in this space, not a bot
- Ends with a genuine question or a sharp insight that invites a reply
- Matches the base voice adjectives above, tuned to the context's voice profile
- Is 1-3 sentences, no hashtags, no emoji, no "Great post!" openers

Return ONLY the comment text, nothing else — no quotes, no preamble, no explanation.`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.post('/api/generate', async (req, res) => {
  const { postText, context, baseVoice } = req.body || {};

  if (!postText || !postText.trim()) {
    return res.status(400).json({ error: 'postText is required.' });
  }
  if (!context || !context.creatorType || !context.industry || !context.voiceProfile) {
    return res.status(400).json({ error: 'context (creatorType, industry, voiceProfile) is required.' });
  }
  if (!Array.isArray(baseVoice) || baseVoice.length !== 3 || baseVoice.some((a) => !a || !a.trim())) {
    return res.status(400).json({ error: 'baseVoice must be an array of 3 non-empty adjectives.' });
  }

  // If neither provider is configured, fail fast with a specific, actionable
  // message instead of waiting on doomed network calls and returning a vague
  // "both failed" error.
  if (!CLAUDE_KEY_CONFIGURED && !GEMINI_KEY_CONFIGURED) {
    return res.status(500).json({
      error: 'No API keys are configured on the server. Set CLAUDE_API_KEY as an environment ' +
        'variable and restart the server (e.g. CLAUDE_API_KEY=sk-ant-... npm start). ' +
        'GEMINI_API_KEY is optional and only used as a fallback.',
    });
  }

  const prompt = buildPrompt({ postText, context, baseVoice });
  let claudeErrorMessage = null;

  // Try Claude first, if configured.
  if (CLAUDE_KEY_CONFIGURED) {
    try {
      const comment = await generateWithClaude(prompt);
      return res.json({ comment, source: 'claude' });
    } catch (claudeErr) {
      claudeErrorMessage = claudeErr.message;
      console.error('[Claude] generation failed:', claudeErr.message);
    }
  } else {
    claudeErrorMessage = 'CLAUDE_API_KEY is not set on the server.';
    console.warn('[Claude] skipped — CLAUDE_API_KEY is not set.');
  }

  // Fall back to Gemini, if configured.
  if (GEMINI_KEY_CONFIGURED) {
    try {
      const comment = await generateWithGemini(prompt);
      return res.json({ comment, source: 'gemini' });
    } catch (geminiErr) {
      console.error('[Gemini] fallback generation also failed:', geminiErr.message);
      return res.status(502).json({
        error: `Claude failed (${claudeErrorMessage}) and the Gemini fallback also failed ` +
          `(${geminiErr.message}). Check your API keys and connection, then try again.`,
      });
    }
  }

  // Claude failed/was skipped, and there's no Gemini key to fall back to.
  return res.status(502).json({
    error: `Claude failed: ${claudeErrorMessage}. No GEMINI_API_KEY is set for a fallback attempt.`,
  });
});

async function generateWithClaude(prompt) {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || !textBlock.text.trim()) {
    throw new Error('Claude returned an empty response.');
  }
  return textBlock.text.trim();
}

async function generateWithGemini(prompt) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await withTimeout(model.generateContent(prompt), REQUEST_TIMEOUT_MS, 'Gemini');
  const text = result.response.text();
  if (!text || !text.trim()) {
    throw new Error('Gemini returned an empty response.');
  }
  return text.trim();
}

app.listen(PORT, () => {
  console.log(`CommentlyAI running at http://localhost:${PORT}`);
});
