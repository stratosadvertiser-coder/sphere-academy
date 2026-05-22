# 🤖 Sphere Coach — AI Marketing Copilot Setup

This guide walks you through deploying the AI Coach backend
(Cloudflare Worker + Anthropic Claude API) and connecting it
to Sphere Academy.

Total time: **~10 minutes**. Total cost: **~₱0–₱500/month**
depending on usage.

---

## What you're setting up

```
┌──────────────────┐   POST    ┌──────────────────┐   POST   ┌────────────────┐
│  Sphere Academy  │ ────────▶ │ Cloudflare       │ ───────▶ │ Anthropic      │
│  browser / app   │           │ Worker (proxy)   │          │ Claude API     │
└──────────────────┘           └──────────────────┘          └────────────────┘
       ▲                              │   ▲                            │
       │                              │   │ ANTHROPIC_API_KEY          │
       │                              │   │ (secret env var)           │
       │       JSON { reply }         │   │                            │
       └──────────────────────────────┘   └────────────────────────────┘
```

The Worker holds your Anthropic API key as a server-side secret.
The browser never sees the key — it only talks to your Worker.

---

## Step 1 — Get an Anthropic API key (~2 min)

1. Go to **https://console.anthropic.com**
2. Sign up / log in
3. **Plans & Billing** → add a credit card. You get **$5 free credit**.
4. **API Keys** → **Create Key** → name it `sphere-coach`
5. Copy the key (starts with `sk-ant-…`) — save it temporarily, you'll paste it in Step 2

**Cost estimate:** Claude Sonnet ≈ $0.001 per short reply (~₱0.05).
20 students × 10 messages/day × 30 days = ₱300/month.

---

## Step 2 — Deploy the Cloudflare Worker (~5 min)

1. Go to **https://dash.cloudflare.com**
2. Sign up / log in (free, no credit card)
3. Click **Workers & Pages** in the left sidebar → **Create application** → **Create Worker**
4. Name it: `sphere-coach` → **Deploy**
5. After deploy, click **Edit code**
6. **Delete** everything in the editor and **paste** the entire contents of `cloudflare-worker.js` from this repo
7. Click **Deploy** (top right)
8. Click **← Worker name** (top left) to go back to the overview

### 2a — Add the API key as a secret

1. On the Worker overview page → click **Settings** tab → **Variables**
2. Under **Environment Variables**, click **Add variable**:
   - **Variable name:** `ANTHROPIC_API_KEY`
   - **Value:** paste your `sk-ant-…` key from Step 1
   - Click **Encrypt** so it's stored as a secret
3. Click **Save and deploy**

### 2b — (Optional) Lock down allowed origins

By default the Worker accepts requests from any origin. To
restrict to your live site only:

1. Same **Variables** panel → **Add variable**:
   - **Variable name:** `ALLOWED_ORIGINS`
   - **Value:** `https://stratosadvertiser-coder.github.io,http://localhost:5500`
   - (do NOT encrypt — this one isn't secret)
2. **Save and deploy**

### 2c — Copy your Worker URL

On the Worker overview page, you'll see a URL like:
```
https://sphere-coach.YOUR-USERNAME.workers.dev
```
Copy this — you'll paste it in Step 3.

---

## Step 3 — Connect the frontend (~1 min)

Two ways to set the Worker URL:

### Option A (quickest, for testing)
Open the live Sphere Academy site, press **F12** to open DevTools
→ **Console** tab → paste and Enter:

```js
localStorage.setItem('sphere_coach_endpoint', 'https://sphere-coach.YOUR-USERNAME.workers.dev/coach');
```

Refresh the page. The chat bubble (bottom-right violet circle)
should now work for **you only** (it's saved in your browser's
localStorage).

### Option B (for everyone)
Edit `script.js` directly:

1. Find this line near the SPHERE COACH section:
   ```js
   var DEFAULT_ENDPOINT = '';
   ```
2. Change to:
   ```js
   var DEFAULT_ENDPOINT = 'https://sphere-coach.YOUR-USERNAME.workers.dev/coach';
   ```
3. Commit + push to GitHub. Now everyone who loads the site
   uses the coach.

> ⚠️ Note: the Worker URL is not a secret — it's just a public
> endpoint. The API key stays on the Worker. Safe to commit.

---

## Step 4 — Test it!

1. Open Sphere Academy on the dashboard (or any in-app page)
2. Bottom-right corner → click the violet **Coach** bubble
3. Try one of the suggested prompts, or type:
   > "Critique this hook: Pinakamadaling paraan para kumita online."
4. You should get a structured response in ~2–5 seconds

---

## What students see

A floating violet "Coach" bubble at bottom-right of every
in-app page. Tap to open a chat panel with:

- 5 suggested prompts (critique copy / brainstorm hooks / explain
  / review assignment / career advice)
- Free-form text input (Ctrl+Enter to send)
- Markdown rendering (bold, lists, code blocks)
- Clear conversation button
- Daily limit counter (20 msg/day default)

Conversation history is saved per-device in localStorage. It
doesn't sync across devices (intentional — chat is meant to be
ephemeral, like a quick check-in with a mentor).

---

## Adjusting limits

In `script.js` — search for `SPHERE_COACH` block:
- `DAILY_LIMIT = 20` — per-user messages per day (client-side)
- `MAX_INPUT = 2000` — char limit on each message

In `cloudflare-worker.js`:
- `RATE_LIMIT = 30` per minute per user (server-side spam guard)
- `RATE_WINDOW_MS = 60_000` rate-limit window
- `max_tokens: 800` in the API payload — caps reply length

---

## Updating the system prompt

The coach's personality, focus, and rules are in the
`SYSTEM_PROMPT` constant at the top of `cloudflare-worker.js`.
Edit, redeploy the Worker (one click in Cloudflare dashboard),
and the next message uses the new prompt. Existing chat history
on the client is untouched.

---

## Troubleshooting

**"Sphere Coach is not configured yet."**
The frontend can't find the Worker URL. Check Step 3.

**"Couldn't reach the coach: HTTP 401"**
The Worker doesn't have a valid API key. Re-check Step 2a.

**"Couldn't reach the coach: HTTP 429"**
Rate limit hit (server-side or Anthropic's). Slow down or
raise the Worker's `RATE_LIMIT`.

**"Couldn't reach the coach: HTTP 502"**
Anthropic upstream had an issue. Try again in a few seconds.

**The chat bubble doesn't appear**
It only shows on in-app pages (dashboard / lesson / profile /
course / etc.) when you're logged in. Skips login + signup +
landing-for-guests pages by design.

**I want to disable it for some users**
Easiest: in `script.js`, find `_shouldMount()` and add your
condition (e.g. only show for admins, or skip for specific
usernames).

**Costs ballooned**
Check Anthropic console → Usage. Lower `DAILY_LIMIT` in
script.js, drop `max_tokens` in the Worker, or rotate to a
cheaper Claude Haiku model (change `model` in `cloudflare-worker.js`
to `'claude-3-5-haiku-20241022'` — ~3× cheaper per request).

---

## Files involved

- **`script.js`** — `SPHERE_COACH` module (frontend chat UI + client)
- **`styles.css`** — coach bubble + panel + message styles
- **`cloudflare-worker.js`** — backend proxy with API key + system prompt
- **`SETUP_AI_COACH.md`** — this file

All committed to the repo. Worker is deployed separately and
referenced by URL.
