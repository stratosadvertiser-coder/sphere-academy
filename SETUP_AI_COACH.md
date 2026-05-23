# 🤖 Sphere Coach — AI Marketing Copilot Setup

This guide walks you through deploying the AI Coach backend
(Cloudflare Worker + Cloudflare Workers AI) and connecting it
to Sphere Academy.

Total time: **~5 minutes**. Total cost: **₱0 / month**
(free tier — no credit card required).

---

## What you're setting up

```
┌──────────────────┐   POST    ┌──────────────────┐   internal   ┌────────────────────┐
│  Sphere Academy  │ ────────▶ │ Cloudflare       │ ───────────▶ │ Cloudflare         │
│  browser / app   │           │ Worker (proxy)   │              │ Workers AI         │
└──────────────────┘           └──────────────────┘              │ (Llama 3.3 70B)    │
       ▲                              │                          └────────────────────┘
       │       JSON { reply }         │
       └──────────────────────────────┘
```

The Worker calls **Cloudflare's own AI runtime** through a built-in
binding — no external API key, no secrets, no credit card.

**Free tier:** 10,000 "neurons" per day (≈ several hundred Sphere
Coach replies). When you exceed that, requests just start
returning quota errors until midnight UTC — no surprise bill.

---

## Step 1 — Create the Cloudflare Worker (~2 min)

1. Go to **https://dash.cloudflare.com**
2. Sign up / log in (free, no credit card)
3. Left sidebar → **Workers & Pages** → **Create application** → **Create Worker**
4. Name it: `sphere-coach` → **Deploy**
5. After the "Hello World" deploy finishes, click **Edit code**
6. **Select all** in the editor (Ctrl+A) → **delete** → **paste** the entire contents of `cloudflare-worker.js` from this repo
7. Click **Deploy** (top right)
8. Click the worker name (top-left breadcrumb) to go back to the overview

---

## Step 2 — Add the Workers AI binding (~1 min)

This is what gives the Worker access to Cloudflare's free AI models.

1. On the Worker overview → **Settings** tab → **Bindings**
2. Click **Add binding** → choose **Workers AI**
3. **Variable name:** `AI` (exactly — uppercase, two letters)
4. Click **Save and deploy**

That's it. Llama 3.3 70B is now wired in.

---

## Step 3 — (Optional) Lock down allowed origins

By default the Worker accepts requests from any origin. To
restrict to your live site only:

1. **Settings** tab → **Variables** → **Add variable**:
   - **Variable name:** `ALLOWED_ORIGINS`
   - **Value:** `https://stratosadvertiser-coder.github.io,http://localhost:5500`
   - (do NOT encrypt — this one isn't secret)
2. **Save and deploy**

---

## Step 4 — Copy your Worker URL

On the Worker overview page, you'll see a URL like:
```
https://sphere-coach.YOUR-USERNAME.workers.dev
```

Copy this — you'll paste it into Sphere Academy in the next step.

---

## Step 5 — Connect Sphere Academy (~30 sec)

1. Open the live site, sign in as admin (`stratos.advertiser@gmail.com`)
2. Bottom-right corner → click the **violet Coach bubble**
3. You'll see a setup card with three numbered steps. Skip to the input.
4. Paste your Worker URL there, append `/coach` at the end:
   ```
   https://sphere-coach.YOUR-USERNAME.workers.dev/coach
   ```
5. Click **Save**
6. Click **Test connection** — should show ✓ alive with a short reply preview

Done! Send a real message to verify the full flow.

> The URL is stored in your browser's `localStorage`. To roll
> it out to everyone without each student doing this step, edit
> `script.js` → find `var DEFAULT_ENDPOINT = '';` near the
> SPHERE_COACH module → paste the URL there → commit + push.

---

## Step 6 — Test it!

Try one of the suggested prompts in the chat, or type:

> "Critique this hook: Pinakamadaling paraan para kumita online."

You should get a structured response in ~2–5 seconds.

---

## (Optional) Upgrade to Claude later

If you outgrow the 10,000-neuron daily quota or want
Claude-quality nuance, you can flip the Worker over to paid
Anthropic Claude without touching any code.

1. Get an Anthropic API key at https://console.anthropic.com
2. Worker → **Settings** → **Variables** → **Add variable**:
   - **Variable name:** `ANTHROPIC_API_KEY`
   - **Value:** paste your `sk-ant-…` key
   - Click **Encrypt**
3. **Save and deploy**

That's it. The Worker auto-detects the secret and routes to Claude
Sonnet instead of Llama. Remove the secret to switch back to free.

**Cost estimate (Claude path):** ~$0.001 per short reply (~₱0.05).
20 students × 10 msgs/day × 30 days ≈ ₱300/month.

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
- `max_tokens: 800` in the AI payload — caps reply length
- `WORKERS_AI_MODEL` — swap to `'@cf/meta/llama-3.1-8b-instruct-fast'`
  to stretch the free quota ~4-5× further at the cost of some quality.

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
The frontend can't find the Worker URL. Open the coach bubble
as admin and paste the URL into the setup card (Step 5).

**"Workers AI binding not configured."**
You skipped Step 2. Worker → Settings → Bindings → Add → Workers AI → name it exactly `AI`.

**"Couldn't reach the coach: HTTP 429"**
Rate limit hit (server-side spam guard, or Cloudflare's
daily neuron quota). Slow down, wait, or raise `RATE_LIMIT`.

**"Couldn't reach the coach: HTTP 500"**
Click **Test connection** in the setup card → check the error
message. Most commonly: missing AI binding or daily quota exceeded.

**Replies feel off / hallucinating / repeating itself**
Llama 3.3 70B is great but not Claude. If quality matters more
than cost, add the `ANTHROPIC_API_KEY` secret to switch to
Claude (see "Optional — upgrade to Claude later" above).

**The chat bubble doesn't appear**
It only shows on in-app pages (dashboard / lesson / profile /
course / etc.) when you're logged in. Skips login + signup +
landing-for-guests pages by design.

**I want to disable it for some users**
Easiest: in `script.js`, find `_shouldMount()` and add your
condition (e.g. only show for admins, or skip for specific
usernames).

---

## Files involved

- **`script.js`** — `SPHERE_COACH` module (frontend chat UI + client)
- **`styles.css`** — coach bubble + panel + message styles
- **`cloudflare-worker.js`** — backend proxy with system prompt + AI calls
- **`SETUP_AI_COACH.md`** — this file

All committed to the repo. Worker is deployed separately and
referenced by URL.
