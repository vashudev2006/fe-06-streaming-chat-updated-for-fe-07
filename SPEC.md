# Capstone Specification: Streaming Lead Qualification Chat

## Capstone option

FE4: Open project

## Product summary

Streaming Lead Qualification Chat is a web application that helps a sales or
operations user qualify an inbound lead in a conversational interface. The app
streams an assistant response as it is generated and can call a typed
`scoreLead` tool to return an explainable lead score, tier, and follow-up
reasons.

## Target user

The primary user is a sales development representative or operations teammate
who needs a quick, consistent first-pass view of an inbound lead before
deciding whether to prioritize, nurture, or deprioritize it.

## Core flow

1. The user opens the chat and enters a question or a lead-scoring request.
2. The client sends the recent conversation to the server-side chat route.
3. The route streams assistant tokens back through Server-Sent Events.
4. For a lead-scoring request, the assistant calls `scoreLead` with a name,
   company, and budget.
5. The UI shows the tool lifecycle while input is streaming and being
   validated.
6. The app renders either an explainable score card or a visible error card.
7. The conversation remains available in React state for follow-up turns.

## Screens and states

- Home page: product overview, architecture summary, and entry point to chat.
- Chat transcript: user messages, streamed assistant text, and a message
  composer with a stop-stream control.
- Lead score result: score gauge, cold/warm/hot tier, budget, and reasons.
- Tool progress: input-streaming and input-available states.
- Error states: invalid lead input, tool failure, API failure, and interrupted
  stream feedback.
- Supporting pages: architecture, deployment checklist, and health endpoint.

## Data sources and boundaries

- User-entered chat messages and lead information.
- Anthropic Messages API for live model responses when `ANTHROPIC_API_KEY` is
  configured.
- A deterministic server-side `scoreLead` function for validation and scoring.
- Local fallback streaming mode for a reviewable demo when no API key is set.

The API key stays on the server. The browser only calls the app's `/api/chat`
endpoint and never receives the Anthropic secret.

## AI features

- Token-by-token streaming responses from the Anthropic Messages API.
- A typed `scoreLead` tool with Zod validation for name, company, and budget.
- Structured output rendered as a score card rather than raw JSON.
- Assistant text after tool execution to summarize the score in plain language.
- Clear handling for malformed tool input, invalid budgets, and stream errors.

## Technical stack

- Next.js with the App Router
- TypeScript
- React
- Tailwind CSS
- Anthropic Messages API
- Server-Sent Events for response streaming
- Zod for tool input/output validation
- Vitest and Playwright for verification

## Delivery and quality goals

- A deployed preview that works at desktop and mobile widths.
- Preserved conversation state across multiple turns.
- Server-side secret handling, request size limits, and basic per-IP rate
  limiting for public review.
- Automated component and primary-flow tests, plus accessibility and
  performance audit evidence.
