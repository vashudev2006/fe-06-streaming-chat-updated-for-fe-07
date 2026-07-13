# Claude Collaboration Notes

This repo is the FE-06 streaming chat build.

## Guardrails

- Keep the model config and system prompt in `src/lib/chat-config.ts`.
- Keep the API key server-side only.
- Preserve chat history across turns in React state.
- Verify the preview at desktop and mobile widths.
