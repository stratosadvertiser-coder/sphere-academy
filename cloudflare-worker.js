/**
 * Sphere Academy — AI Coach Cloudflare Worker
 * ===========================================
 *
 * This Worker is the secure backend for the AI Marketing Copilot.
 *
 * PRIMARY brain:  Cloudflare Workers AI (Llama 3.3 70B) — FREE.
 *                 10,000 neurons/day on the free plan ≈ several
 *                 hundred Sphere Coach messages every day. No
 *                 credit card, no external API key.
 *
 * FALLBACK brain: Anthropic Claude (paid) — only used if you set
 *                 the ANTHROPIC_API_KEY secret. Useful later if
 *                 you outgrow the free tier or want Claude-quality
 *                 responses.
 *
 * DEPLOYMENT (free path)
 *   See SETUP_AI_COACH.md. Short version:
 *   1. cloudflare.com → Workers & Pages → Create Worker
 *   2. Paste this file into the editor → Deploy
 *   3. Settings → Bindings → Add → "Workers AI"
 *        Variable name: AI
 *   4. (Optional) Settings → Variables → Add:
 *        ALLOWED_ORIGINS = https://stratosadvertiser-coder.github.io,http://localhost
 *   5. Save and deploy
 *   6. Copy the *.workers.dev URL → in Sphere Academy, click the
 *      Coach bubble and paste the URL into the setup card.
 *
 * To switch back to Anthropic Claude, just add the secret
 * ANTHROPIC_API_KEY — the Worker auto-detects it and uses Claude
 * instead of Llama.
 */

const SYSTEM_PROMPT = `You are Sphere Coach, an AI marketing mentor inside Sphere Academy — a training platform for Filipino marketing interns built by Stratos Advertiser.

YOUR ROLE
You help students master direct-response marketing for the Filipino market. You answer questions, critique their work, brainstorm with them, and explain concepts in plain language.

TONE
- Friendly senior marketer / kuya-ate vibe. Approachable, never condescending.
- Mix Taglish naturally if the student speaks Taglish. Stay in English if they're fully English.
- Use Filipino market context: Lazada, Shopee, TikTok Shop, Meta Ads, GCash, online sellers, drop-shipping in PH, Mercury Drug, SM, Jollibee, Globe, Smart, local FB groups, Messenger commerce, etc.
- Be specific and actionable. No generic platitudes like "you got this!" — actually help them improve.

WHAT YOU DO BEST
- Critique ad copy: tell them (1) what works, (2) what to improve, (3) give a rewritten version.
- Brainstorm: 3-5 concrete options with brief rationale.
- Explain concepts: lead with a 1-sentence definition, then a Filipino-context example.
- Review assignments / creatives / scripts: structured feedback with priorities ranked.
- Career advice: practical steps relevant to a beginner-to-mid Filipino freelance / agency marketer.

KNOWLEDGE FOCUS
- Direct-response copywriting: hooks, body, CTAs, AIDA, PAS, hook-story-offer
- Meta Ads Manager (campaigns, ad sets, audiences, creatives, retargeting, custom audiences, lookalikes)
- TikTok Ads + Shopee/Lazada Ads
- Creative production with Canva, Adobe Express, CapCut, Photoshop basics
- Chatbot marketing (Botcake, Chatfuel, ManyChat)
- Filipino consumer psychology (price sensitivity, social proof, FOMO, family decision-making)
- Funnels: awareness → engagement → conversion → retention

CONSTRAINTS
- Keep most replies under 200 words. Use bullet points for multi-part answers.
- Don't pretend to know things you don't — if uncertain, say "I'm not 100% sure, but…"
- Don't give legal, tax, or medical advice. Suggest they consult a pro.
- Don't help with anything unethical, deceptive, or scammy.

You're talking inside Sphere Academy right now — they can see you in a small chat panel on the bottom-right. Be helpful, concise, and a little warm.`;

// Default Workers AI model. Llama 3.3 70B = best free-tier quality.
// If you want to stretch the daily neuron budget further, swap to
// '@cf/meta/llama-3.1-8b-instruct-fast' (about 4-5x cheaper in
// neurons per reply, but less nuanced).
const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ── CORS helpers ─────────────────────────────────────────────────
function corsHeaders(req, env) {
  const allowedRaw = (env && env.ALLOWED_ORIGINS) || '*';
  const allowed = allowedRaw === '*'
    ? ['*']
    : allowedRaw.split(',').map(s => s.trim()).filter(Boolean);

  const origin = req.headers.get('Origin') || '';
  const allowOrigin = allowed.includes('*')
    ? '*'
    : (allowed.includes(origin) ? origin : allowed[0] || '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

// ── Simple in-memory rate limit (per-Worker isolate) ────────────
const RATE = new Map();
const RATE_LIMIT = 30;            // requests
const RATE_WINDOW_MS = 60 * 1000; // per minute

function rateLimited(userKey) {
  const now = Date.now();
  const rec = RATE.get(userKey) || { count: 0, reset: now + RATE_WINDOW_MS };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + RATE_WINDOW_MS;
  }
  rec.count++;
  RATE.set(userKey, rec);
  return rec.count > RATE_LIMIT;
}

// ── Brain implementations ───────────────────────────────────────

/**
 * Cloudflare Workers AI — free tier, primary brain.
 * Needs an "AI" binding configured on the Worker.
 * Returns: { reply, model, source: 'workers-ai' }
 */
async function askWorkersAI(env, cleanMessages) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    throw new Error('Workers AI binding "AI" is missing. Add it in Worker → Settings → Bindings.');
  }

  // Workers AI takes a flat messages array with the system role inline.
  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...cleanMessages
    ],
    max_tokens: 800
  };

  const result = await env.AI.run(WORKERS_AI_MODEL, payload);

  // Workers AI returns { response: "string" } for chat models.
  // Some models nest it differently — handle both shapes defensively.
  const reply = (result && (result.response || result.result || ''))
    || (Array.isArray(result?.choices) ? (result.choices[0]?.message?.content || '') : '')
    || '';

  if (!reply) {
    throw new Error('Workers AI returned an empty reply.');
  }

  return {
    reply: String(reply).trim(),
    model: WORKERS_AI_MODEL,
    source: 'workers-ai'
  };
}

/**
 * Anthropic Claude — paid fallback. Only used when
 * ANTHROPIC_API_KEY env var is set.
 * Returns: { reply, model, usage, source: 'anthropic' }
 */
async function askAnthropic(env, cleanMessages) {
  const apiPayload = {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: cleanMessages
  };

  const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(apiPayload)
  });

  if (!apiResp.ok) {
    const errBody = await apiResp.text().catch(() => '');
    console.error('[Anthropic]', apiResp.status, errBody);
    const err = new Error(`Anthropic HTTP ${apiResp.status}`);
    err.status = apiResp.status;
    throw err;
  }

  const data = await apiResp.json();
  const reply = Array.isArray(data.content)
    ? data.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n')
    : '';

  return {
    reply: String(reply).trim(),
    model: data.model,
    usage: data.usage,
    source: 'anthropic'
  };
}

// ── Main fetch handler ───────────────────────────────────────────
export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(req, env);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Parse body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No messages provided' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit per user (or per IP fallback)
    const userKey = (body.user && String(body.user).slice(0, 64)) ||
                    req.headers.get('CF-Connecting-IP') || 'anon';
    if (rateLimited(userKey)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit: too many requests, slow down.' }),
        { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize messages — strip anything other than role + content,
    // cap length so a single huge message can't drain tokens.
    const cleanMessages = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
      .map(m => ({
        role: m.role,
        content: String(m.content || '').slice(0, 4000)
      }))
      .slice(-20); // last 10 exchanges

    if (cleanMessages.length === 0 || cleanMessages[cleanMessages.length - 1].role !== 'user') {
      return new Response(
        JSON.stringify({ error: 'Last message must be from user.' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // ── Pick the brain ──────────────────────────────────────────
    // If ANTHROPIC_API_KEY is set, use Claude (paid). Otherwise use
    // Workers AI free Llama 3.3 70B. This lets you upgrade later
    // by adding the secret, without touching code.
    const usePaidClaude = !!env.ANTHROPIC_API_KEY;

    try {
      const result = usePaidClaude
        ? await askAnthropic(env, cleanMessages)
        : await askWorkersAI(env, cleanMessages);

      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.error('[Worker]', e && e.message);

      // If Workers AI is down or unbound and the admin hasn't set
      // up Claude either, return a friendly setup hint.
      const hint = !usePaidClaude && /binding|AI/i.test(e.message || '')
        ? 'Workers AI binding not configured. In your Worker settings, add a binding named "AI" of type Workers AI.'
        : 'Coach is offline. Try again in a moment.';

      return new Response(
        JSON.stringify({ error: hint, detail: e.message }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
  }
};
