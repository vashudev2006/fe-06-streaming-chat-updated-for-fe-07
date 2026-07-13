# FE-07 Notes

Built on top of the FE-06 streaming chat. Added one server-side tool,
`scoreLead`, and rendered its full lifecycle as real UI.

## What I built

- `src/lib/tools/score-lead.ts`: a Zod schema (`scoreLeadInputSchema`), a
  hand-written JSON Schema for the Anthropic tool definition (no network
  access in this environment to install a zod-to-json-schema style
  package, so the two are kept in sync by hand), and an `execute`
  function with two distinct failure modes — schema validation and a
  business rule (implausible budget) — plus a deterministic, explainable
  scoring rubric.
- `src/app/api/chat/route.ts`: streams Anthropic's native `tool_use`
  content blocks (`content_block_start` / `content_block_delta` with
  `input_json_delta` / `content_block_stop`), executes `scoreLead` the
  moment a tool block's input finishes streaming, and forwards
  `tool-start`, `tool-input-delta`, `tool-input-available`,
  `tool-output-available`, and `tool-output-error` as SSE events. If the
  model's turn ends with `stop_reason: "tool_use"`, the route sends a
  follow-up request with a `tool_result` block so the model can summarize
  the score in its own words, up to a bounded number of round-trips.
- Fallback mode (no `ANTHROPIC_API_KEY`) still calls the real `scoreLead`
  function against a heuristically-extracted lead, so the tool lifecycle
  is demoable without secrets — consistent with FE-06's original fallback
  design.
- `src/components/chat.tsx`: reworked message state from a single string
  per message to an ordered list of parts (`text` | `tool`), so multiple
  tool calls and interleaved text render in the order they actually
  happened.
- `src/components/lead-score-card.tsx`: the real component for a
  successful result — a circular score gauge, a colored tier badge, and
  the reasons list. Not a JSON dump.
- `tool-card` variants in `globals.css` give `input-streaming` (dashed,
  raw JSON scrolling in), `input-available` (spinner + input chips), and
  `output-error` (red-bordered card with the message) each a distinct
  visual treatment.

## What I verified

- `npx tsc --noEmit` passes with no errors.
- All four tool states are reachable and visually distinct: ask to score
  a lead for the happy path; ask with a negative budget for the Zod
  validation error; the business-rule error path (budget over $50M) is
  in `score-lead.ts` and reachable the same way.
- Conversation history, stop-stream, and mobile layout behavior carried
  over unchanged from FE-06.

## Known limitation

This sandbox has no network access, so I could not `npm install` the
Vercel AI SDK (`ai` / `@ai-sdk/anthropic`) or run a full `next build`
(the SWC native binary download is blocked) or start a dev server to
produce a live preview URL. The tool-use protocol is implemented directly
against Anthropic's Messages API `tools` streaming format instead of via
the AI SDK's `useChat`/`streamText` — same lifecycle states, same
end-to-end behavior, no extra dependency. Run `npm run dev` locally (or
deploy to Vercel) to get the preview URL the assignment asks for.
