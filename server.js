const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 20000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Few-shot exemplars pulled directly from the CommentlyAI PRD. These anchor
// tone/specificity across contexts and are prepended to every generation call.
const FEW_SHOT_EXAMPLES = [
  {
    context: 'AI/Tech Founders',
    post: 'A founder post about a distribution challenge their startup is facing.',
    comment:
      "The distribution problem is the real moat here, not the model. Most teams building in this space are still thinking about it like a product launch. Curious how you're thinking about retention beyond the first use case — that's where the real differentiation usually surfaces.",
  },
  {
    context: 'Creative/Design',
    post: 'A designer post showing a portfolio piece.',
    comment:
      'The constraint is doing the heavy lifting here — you can feel it in the composition. What was the brief, and how much of this was intentional vs. discovered in process?',
  },
  {
    context: 'Finance/Investing',
    post: 'An investor post reflecting on a lesson from a failed investment.',
    comment:
      "The framing here is interesting — most people lead with the return, you led with the mistake. That's a different reader relationship. What made you decide to structure it that way?",
  },
];

function buildSystemPrompt(baseVoice) {
  const voiceLine = Array.isArray(baseVoice) && baseVoice.filter(Boolean).length
    ? baseVoice.filter(Boolean).join(', ')
    : 'thoughtful, direct, curious';

  const examplesBlock = FEW_SHOT_EXAMPLES.map(
    (ex) =>
      `Context: ${ex.context}\nPost: ${ex.post}\nGood comment: "${ex.comment}"`
  ).join('\n\n');

  return `You write LinkedIn comments for a creator whose base voice is: ${voiceLine}. This base voice stays constant, but its register shifts depending on the active context (creator type, industry/niche, and voice profile) provided with each request.

Rules for every comment:
- Be specific to the actual content of the pasted post — reference a real detail, not a generic compliment.
- Sound like a knowledgeable human, never like a bot or generic praise ("Great post!", "Love this!", "So true!").
- End with a genuine question or a sharp insight that invites a reply and opens real conversation.
- Match the register of the active context while keeping the base voice adjectives intact underneath.
- Keep it to 1-3 sentences, no hashtags, no emojis unless the post itself is emoji-heavy.
- Output ONLY the comment text. No preamble, no quotation marks, no labels.

Examples of the quality bar (for calibration, not copying):

${examplesBlock}`;
}

function buildUserPrompt({ postText, postUrl, context, baseVoice }) {
  const ctx = context || {};
  return `Active context:
- Preset: ${ctx.presetName || 'Custom'}
- Creator Type: ${ctx.creatorType || 'n/a'}
- Industry/Niche: ${ctx.industry || 'n/a'}
- Voice Profile: ${ctx.voiceProfile || 'n/a'}

Base voice adjectives: ${(baseVoice || []).filter(Boolean).join(', ') || 'n/a'}

LinkedIn post to comment on${postUrl ? ` (${postUrl})` : ''}:
"""
${postText}
"""

Write one comment following the rules above.`;
}

async function generateWithClaude({ postText, postUrl, context, baseVoice }) {
  if (!process.env.CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY not configured');
  }
  const client = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
    timeout: REQUEST_TIMEOUT_MS,
  });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 300,
    system: buildSystemPrompt(baseVoice),
    messages: [
      { role: 'user', content: buildUserPrompt({ postText, postUrl, context, baseVoice }) },
    ],
  });
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('Claude returned an empty response');
  return text;
}

async function generateWithGemini({ postText, postUrl, context, baseVoice }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: buildSystemPrompt(baseVoice),
  });
  const result = await model.generateContent(
    buildUserPrompt({ postText, postUrl, context, baseVoice })
  );
  const text = result.response.text().trim();
  if (!text) throw new Error('Gemini returned an empty response');
  return text;
}

app.post('/api/generate-comment', async (req, res) => {
  const { postText, postUrl, context, baseVoice } = req.body || {};

  if (!postText || !postText.trim()) {
    return res.status(400).json({ error: 'postText is required' });
  }

  try {
    const comment = await generateWithClaude({ postText, postUrl, context, baseVoice });
    return res.json({ comment, source: 'claude' });
  } catch (claudeErr) {
    console.error('Claude generation failed, falling back to Gemini:', claudeErr.message);
    try {
      const comment = await generateWithGemini({ postText, postUrl, context, baseVoice });
      return res.json({ comment, source: 'gemini' });
    } catch (geminiErr) {
      console.error('Gemini fallback also failed:', geminiErr.message);
      return res.status(502).json({
        error:
          'Both Claude and Gemini are unavailable right now. Check your API keys (CLAUDE_API_KEY / GEMINI_API_KEY) and try again.',
      });
    }
  }
});

// --- Scraping API scaffold -------------------------------------------------
// Disabled by default. This is the clean drop-in point for a future
// third-party LinkedIn scraping provider — no provider has been chosen yet.
const SCRAPING_ENABLED = false;

async function scrapeLinkedInPost(_url) {
  throw new Error('not implemented');
}

app.post('/api/scrape-post', async (req, res) => {
  if (!SCRAPING_ENABLED) {
    return res.status(501).json({
      error:
        'Scraping is not implemented in this MVP. This endpoint is a scaffold for a future third-party LinkedIn scraping integration.',
    });
  }
  try {
    const { url } = req.body || {};
    const data = await scrapeLinkedInPost(url);
    return res.json(data);
  } catch (err) {
    return res.status(501).json({ error: err.message });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CommentlyAI running at http://localhost:${PORT}`);
});
