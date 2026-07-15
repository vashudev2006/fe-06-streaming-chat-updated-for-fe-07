# FE-11 Production Streaming Chat

Production-ready version of the FE-06/FE-07 streaming chat assignment. The app
streams assistant text over Server-Sent Events, preserves chat history in React
state, renders the `scoreLead` tool lifecycle as real UI, and adds the README
and production hygiene needed for a public review link.

## Live Preview

Add the deployed URL here before submission:

```text
https://front-end-programming-repo.vercel.app
```

## What It Does

- Streams assistant responses token by token from a Next.js route handler.
- Keeps `ANTHROPIC_API_KEY` server-side only.
- Stores the model choice, system prompt, and chat limits in
  `src/lib/chat-config.ts`.
- Preserves the full visible conversation across turns in React state.
- Supports a typed `scoreLead` tool that shows:
  - `input-streaming`
  - `input-available`
  - `output-available`
  - `output-error`
- Falls back to a local demo stream when no Anthropic key is configured, so
  reviewers can still test the UI without secrets.
- Adds basic production safeguards: per-IP request caps and prompt-size limits.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js, usually:

```text
http://localhost:3000
```

Try these prompts:

```text
Score a lead named Priya Anand at Meridian Robotics with a $120k budget.
Score a lead named Sam at Acme with a budget of -5000.
Explain how the server route differs from the client component.
```

## Environment Variables

| Name | Required | Used In | Description |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Optional locally, required for real production model calls | `src/app/api/chat/route.ts` | Server-only Anthropic API key. Never expose this with `NEXT_PUBLIC_`. |
| `ANTHROPIC_MODEL` | Optional | `src/lib/chat-config.ts` | Overrides the default model. Defaults to `claude-3-5-sonnet-latest`. |

Without `ANTHROPIC_API_KEY`, `/api/chat` runs fallback mode. That mode still
streams SSE events and executes the real `scoreLead` function for lead-scoring
prompts, but it does not call Anthropic.

## Architecture

```text
Browser
  -> src/components/chat.tsx
     - owns transcript state
     - sends prior user/assistant messages to /api/chat
     - reads SSE events incrementally
     - renders token text and tool cards

Next.js server
  -> src/app/api/chat/route.ts
     - validates and trims incoming messages
     - applies request and prompt-size limits
     - reads ANTHROPIC_API_KEY only on the server
     - calls Anthropic Messages API when configured
     - streams token/tool lifecycle events back to the browser

Shared config
  -> src/lib/chat-config.ts
     - model selection
     - system prompt
     - retained turn count

Tool contract
  -> src/lib/tools/score-lead.ts
     - Zod input schema
     - Anthropic tool definition
     - deterministic server-side tool execution
```

## Production Hygiene

- **Secret handling:** API key access stays inside the route handler. The client
  only calls `/api/chat`.
- **Rate limiting:** The route allows 12 requests per client IP per minute in
  the current server instance.
- **Input limits:** Each message is capped at 4,000 characters and each request
  is capped at 12,000 total characters.
- **History limits:** The server only forwards the most recent `MAX_TURNS`
  messages from `src/lib/chat-config.ts`.
- **Failure states:** API errors, malformed tool input, validation failures, and
  mid-stream failures render as visible UI states instead of blank output.

The in-memory rate limiter is enough for this assignment preview. For a
multi-instance production deployment, replace it with a shared store such as
Upstash Redis, Vercel KV, or another edge-safe rate limiter.

## Deploy To Vercel

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Add `ANTHROPIC_API_KEY` in Vercel Project Settings -> Environment Variables.
4. Deploy.
5. Open the deployment URL and test desktop and mobile widths.
6. Add the production URL to the Live Preview section above and submit it.

## Verification

Run the automated checks:

```bash
npm run lint
npm run test:run
npm run build
npm run test:e2e
```

Manual preview checklist:

- Desktop width loads without console errors.
- Mobile width keeps the transcript, composer, and tool cards readable.
- A normal prompt streams text.
- A valid lead prompt renders a `LeadScoreCard`.
- A negative-budget lead prompt renders the tool error card.
- `/health` returns JSON with `ok: true`.

## AI Tools Used

AI assistance was used to plan the FE-11 production pass, inspect the existing
Next.js implementation, add the route safeguards, update reviewer-facing copy,
and draft this README. The implementation was verified through local linting,
tests, build checks, and browser preview checks rather than relying on AI output
alone.
