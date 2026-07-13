# FE-07 Tool Results and Structured Output

This repo builds on the FE-06 streaming chat and adds a server-side tool
call rendered as real UI: a `scoreLead` tool that scores a sales lead from
a name, company, and budget, streamed through its full lifecycle
(input-streaming → input-available → output-available / output-error) and
rendered as a score-card component instead of raw JSON.

## What lives here

- `src/lib/tools/score-lead.ts` — the tool contract: Zod input schema,
  the Anthropic tool definition, and the `execute` function
- `src/app/api/chat/route.ts` — the server route: streams Anthropic's
  native `tool_use` blocks, runs the tool the moment its input finishes
  streaming, and forwards each lifecycle state to the client over SSE;
  also runs a real (non-mocked) fallback demo when no API key is set
- `src/components/chat.tsx` — the client: tracks each assistant message
  as an ordered list of text/tool parts and renders each tool state
  distinctly
- `src/components/lead-score-card.tsx` — the real component rendered for
  a successful `scoreLead` result (gauge, tier badge, reasons)
- `src/lib/chat-config.ts` — shared model/system-prompt config, updated
  so the model knows when to call the tool
- `NOTES.md` — submission write-up

## Tool contract: `scoreLead`

**Name:** `scoreLead`

**Input schema (Zod, `scoreLeadInputSchema`):**

```ts
{
  name: string;     // 1-120 chars, the lead's full name
  company: string;  // 1-160 chars, the lead's company
  budget: number;   // finite, >= 0, USD
}
```

**Return shape (`ScoreLeadOutput`):**

```ts
{
  score: number;                     // integer, 0-100
  tier: "cold" | "warm" | "hot";     // score >= 70 hot, >= 40 warm, else cold
  reasons: string[];                 // human-readable factors behind the score
}
```

**Behavior:** `scoreLead(rawInput)` validates `rawInput` against
`scoreLeadInputSchema` with `.parse()` — a Zod validation failure (missing
field, negative budget, wrong type) throws a `ZodError`, which the route
turns into an `output-error` tool part instead of crashing the request. A
second, business-rule error (`LeadScoringError`) is thrown for
implausible budgets (> $50M) to demonstrate a non-schema failure path
too. On success it returns a deterministic score built from budget size,
whether the company name looks registered, and whether a full name was
given.

**Where it's wired up:**
- Anthropic side: `toAnthropicToolDefinition()` in `score-lead.ts`
  produces the JSON Schema handed to the Messages API's `tools` param.
- Execution: `route.ts` parses the streamed `input_json_delta` chunks,
  and calls `scoreLead()` as soon as the `tool_use` block closes.
- Client: `chat.tsx` renders `input-streaming` (raw JSON streaming in),
  `input-available` (parsed input, tool running), `output-available`
  (real `LeadScoreCard` component), and `output-error` (dedicated error
  card) as visually distinct states.

## Local preview

```bash
npm run dev
```

Then open the local URL Next.js prints in the terminal and try:

- *"Score a lead named Priya Anand at Meridian Robotics with a $120k budget."*
  to see the full success path.
- *"Score a lead named Sam at Acme with a budget of -5000."* to see the
  designed `output-error` state.

## Environment

If you want the route to proxy Anthropic instead of the fallback demo, set:

```bash
ANTHROPIC_API_KEY=your_key_here
```

The key stays server-side only. Without it, the route still runs the real
`scoreLead` function against a heuristically-extracted lead so the tool
lifecycle is demoable without secrets.
