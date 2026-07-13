# FE-06 Workflow Notes

## Feature chosen

I built a streaming chat interface for the capstone shell. The goal was to
match the assignment shape closely: server-side model config, a route handler
that streams tokens, and a client that renders the response incrementally.

## First pass

The first pass focused on the mechanics. I built the chat transcript, wired a
POST route, and added a fallback stream so the preview still works without a
server key.

## Second pass

The second pass tightened the experience. I added the thinking state, a stop
button, mobile-friendly layout, auto-scroll that respects user scrolling, and
shared configuration for the prompt and model.

## What improved

- The chat now streams tokens instead of waiting for a full response.
- The conversation remains in state across multiple turns.
- The UI keeps the transcript readable on smaller screens.
- The route keeps the Anthropic key on the server and out of the browser.
- The fallback stream makes local review possible even without secrets.

## AI mistake I caught

The first version needs to keep the server/client split obvious. That is why
the final shape uses a single config module for the prompt and model instead of
mixing those values into the client component.

## Takeaway

For streaming interfaces, the important part is not just “show text.” It is
the whole loop: start the assistant, stream deltas into the transcript, let
the user stop the flow, and keep the conversation state intact for the next
turn.
