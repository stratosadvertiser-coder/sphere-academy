/**
 * Sphere Academy — AI Coach Cloudflare Worker
 * ===========================================
 *
 * This Worker is the secure backend for the AI Marketing Copilot.
 * It holds the Anthropic API key (NEVER exposed to the browser)
 * and proxies messages to Claude with a marketing-coach system
 * prompt tuned for Filipino marketing interns.
 *
 * DEPLOYMENT
 *   See SETUP_AI_COACH.md for the 5-minute walkthrough. Short
 *   version:
 *   1. cloudflare.com → Workers & Pages → Create Worker
 *   2. Paste this file's contents into the editor
 *   3. Settings → Variables → Add Secret:
 *        ANTHROPIC_API_KEY = sk-ant-...
 *        ALLOWED_ORIGINS   = https://stratosadvertiser-coder.github.io,http://localhost
 *   4. Save and Deploy
 *   5. Copy the *.workers.dev URL → set in the app via console:
 *        localStorage.setItem('sphere_coach_endpoint', 'https://your-worker.workers.dev/coach')
 *
 * FREE TIER
 *   Cloudflare Workers: 100,000 requests/day free, forever.
 *   Anthropic API: pay-as-you-go (Claude Sonnet ~$0.001 per
 *   short reply — about ₱0.05). $5 free credit on signup.
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

// ── CORS helpers ─────────────────────────────────────────────────
function corsHeaders(req, env) {
  // Parse allowed origins from env (comma-separated). Default
  // permissive in dev so the user can test locally.
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
// Per-user soft limit. Resets every minute. Helps prevent rogue
// spam from one student. Cloudflare KV / Durable Objects would be
// better for production rate limiting but this works for a small
// cohort.
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

    // Anthropic API key check
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Server not configured: ANTHROPIC_API_KEY missing.' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
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

    // Build Anthropic API payload
    const apiPayload = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: cleanMessages
    };

    // Call Anthropic
    try {
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
        return new Response(
          JSON.stringify({ error: 'Upstream API error', status: apiResp.status }),
          { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }

      const data = await apiResp.json();
      // Anthropic returns content as an array of blocks.
      const reply = Array.isArray(data.content)
        ? data.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n')
        : '';

      return new Response(
        JSON.stringify({
          reply,
          model: data.model,
          usage: data.usage
        }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.error('[Worker]', e && e.message);
      return new Response(
        JSON.stringify({ error: 'Coach is offline. Try again in a moment.' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
  }
};
