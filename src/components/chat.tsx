"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LeadScoreCard } from "@/components/lead-score-card";
import type { ScoreLeadOutput } from "@/lib/tools/score-lead";

export type ChatRole = "user" | "assistant";

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export type TextPart = { kind: "text"; text: string };
export type NoResultPart = { kind: "no-result" };

export type ToolPart = {
  kind: "tool";
  toolCallId: string;
  toolName: string;
  state: ToolState;
  inputText: string;
  input?: Record<string, unknown>;
  output?: ScoreLeadOutput;
  errorText?: string;
};

export type MessagePart = TextPart | ToolPart | NoResultPart;

export type ChatMessage = {
  id: string;
  role: ChatRole;
  parts: MessagePart[];
  streaming?: boolean;
};

type StreamEvent =
  | { type: "meta"; mode: string }
  | { type: "token"; chunk: string }
  | { type: "tool-start"; toolCallId: string; toolName: string }
  | { type: "tool-input-delta"; toolCallId: string; delta: string }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool-output-available"; toolCallId: string; output: ScoreLeadOutput }
  | { type: "tool-output-error"; toolCallId: string; error: string }
  | { type: "done" }
  | { type: "error"; message: string };

const starterMessages: ChatMessage[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    parts: [
      {
        kind: "text",
        text: 'Ask me to draft a rollout plan, explain a UI choice, or say "score a lead named Sam Rivera at Northwind with a $60k budget" to see the scoreLead tool run end to end.',
      },
    ],
  },
];

type ChatFailure = {
  title: string;
  message: string;
  retryPrompt?: string;
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function textOf(message: ChatMessage): string {
  return message.parts
    .filter((p): p is TextPart => p.kind === "text")
    .map((p) => p.text)
    .join("");
}

function parseEventBlock(block: string): StreamEvent | null {
  const eventLine = block.split("\n").find((line) => line.startsWith("event:"));
  const dataText = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!eventLine || dataText.length === 0) {
    return null;
  }

  const event = eventLine.slice(6).trim();

  try {
    const payload = JSON.parse(dataText) as Record<string, unknown>;

    switch (event) {
      case "meta":
        return { type: "meta", mode: String(payload.mode ?? "") };
      case "token":
        return typeof payload.chunk === "string" ? { type: "token", chunk: payload.chunk } : null;
      case "tool-start":
        return typeof payload.toolCallId === "string" && typeof payload.toolName === "string"
          ? { type: "tool-start", toolCallId: payload.toolCallId, toolName: payload.toolName }
          : null;
      case "tool-input-delta":
        return typeof payload.toolCallId === "string" && typeof payload.delta === "string"
          ? { type: "tool-input-delta", toolCallId: payload.toolCallId, delta: payload.delta }
          : null;
      case "tool-input-available":
        return typeof payload.toolCallId === "string"
          ? {
              type: "tool-input-available",
              toolCallId: payload.toolCallId,
              toolName: String(payload.toolName ?? ""),
              input: (payload.input as Record<string, unknown>) ?? {},
            }
          : null;
      case "tool-output-available":
        return typeof payload.toolCallId === "string"
          ? {
              type: "tool-output-available",
              toolCallId: payload.toolCallId,
              output: payload.output as ScoreLeadOutput,
            }
          : null;
      case "tool-output-error":
        return typeof payload.toolCallId === "string" && typeof payload.error === "string"
          ? { type: "tool-output-error", toolCallId: payload.toolCallId, error: payload.error }
          : null;
      case "done":
        return { type: "done" };
      case "error":
        return typeof payload.message === "string"
          ? { type: "error", message: payload.message }
          : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function readStream(response: Response, onEvent: (event: StreamEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("The response did not include a readable stream.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseEventBlock(block);
      if (event) onEvent(event);
    }

    if (done) {
      if (buffer.trim().length > 0) {
        const event = parseEventBlock(buffer);
        if (event) onEvent(event);
      }
      break;
    }
  }
}

function updateToolPart(
  messages: ChatMessage[],
  assistantId: string | null,
  toolCallId: string,
  updater: (part: ToolPart) => ToolPart,
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== assistantId) return message;
    return {
      ...message,
      parts: message.parts.map((part) =>
        part.kind === "tool" && part.toolCallId === toolCallId ? updater(part) : part,
      ),
    };
  });
}

function hasVisiblePart(parts: MessagePart[]) {
  return parts.some((part) => {
    if (part.kind === "text") return part.text.trim().length > 0;
    if (part.kind === "tool") return part.state === "output-available" || part.state === "output-error";
    return true;
  });
}

function NoResultCard() {
  return (
    <div className="state-card state-card--empty">
      <p className="state-card__title">No result came back</p>
      <p className="state-card__body">
        Try asking for a shorter answer or score a sample lead to confirm the tool path.
      </p>
    </div>
  );
}

function ChatErrorCard({
  failure,
  onRetry,
  retryDisabled,
}: {
  failure: ChatFailure;
  onRetry: () => void;
  retryDisabled: boolean;
}) {
  return (
    <div className="state-card state-card--error" role="alert">
      <div>
        <p className="state-card__title">{failure.title}</p>
        <p className="state-card__body">{failure.message}</p>
      </div>
      {failure.retryPrompt ? (
        <button
          type="button"
          className="button button-primary retry-button"
          onClick={onRetry}
          disabled={retryDisabled}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

function FirstResponseSkeleton() {
  return (
    <div className="skeleton-card" aria-label="Waiting for first response">
      <span className="skeleton-line skeleton-line--wide" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-line--short" />
    </div>
  );
}

function ToolLifecycleCard({ part }: { part: ToolPart }) {
  if (part.state === "output-available" && part.output) {
    return <LeadScoreCard input={part.input} output={part.output} />;
  }

  if (part.state === "output-error") {
    return (
      <div className="tool-card tool-card--error" role="alert">
        <div className="tool-card__header">
          <span className="tool-card__icon" aria-hidden="true">
            ⚠
          </span>
          <div>
            <p className="tool-card__title">scoreLead failed</p>
            <p className="tool-card__subtitle">The tool call did not complete.</p>
          </div>
        </div>
        <p className="tool-card__error-text">{part.errorText}</p>
      </div>
    );
  }

  if (part.state === "input-available") {
    return (
      <div className="tool-card tool-card--running" role="status" aria-label="scoreLead running">
        <div className="tool-card__header">
          <span className="tool-card__spinner" aria-hidden="true" />
          <div>
            <p className="tool-card__title">Running scoreLead...</p>
            <p className="tool-card__subtitle">Validating input and scoring the lead.</p>
          </div>
        </div>
        <div className="tool-card__chips">
          {part.input?.name ? <span className="tool-chip">{String(part.input.name)}</span> : null}
          {part.input?.company ? (
            <span className="tool-chip">{String(part.input.company)}</span>
          ) : null}
          {typeof part.input?.budget === "number" ? (
            <span className="tool-chip">
              ${Number(part.input.budget).toLocaleString("en-US")}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  // input-streaming
  return (
    <div
      className="tool-card tool-card--building"
      role="status"
      aria-label="scoreLead arguments streaming"
    >
      <div className="tool-card__header">
        <span className="tool-card__spinner" aria-hidden="true" />
        <div>
          <p className="tool-card__title">Calling scoreLead...</p>
          <p className="tool-card__subtitle">Streaming tool arguments from the model.</p>
        </div>
      </div>
      <pre className="tool-card__json">{part.inputText || "{"}</pre>
    </div>
  );
}

export function ChatMessageView({ message }: { message: ChatMessage }) {
  const label = message.role === "user" ? "User message" : "Assistant message";

  return (
    <article
      aria-label={label}
      className={`message message--${message.role} ${
        message.streaming ? "message--thinking" : ""
      }`}
    >
      <div className="message-meta">
        <span>{message.role === "user" ? "You" : "Assistant"}</span>
        {message.streaming ? <span className="badge">live</span> : null}
      </div>

      {message.streaming && message.parts.length === 0 ? (
        <FirstResponseSkeleton />
      ) : (
        <div className="message-parts">
          {message.parts.map((part, index) =>
            part.kind === "text" ? (
              part.text.trim().length > 0 ? (
                <p key={index} className="message-body">
                  {part.text}
                </p>
              ) : null
            ) : part.kind === "no-result" ? (
              <NoResultCard key={index} />
            ) : (
              <ToolLifecycleCard key={part.toolCallId} part={part} />
            ),
          )}
        </div>
      )}
    </article>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const [draftHint, setDraftHint] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "thinking" | "streaming">("idle");
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const lastUserPromptRef = useRef<string | null>(null);

  const conversationCount = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages],
  );

  const scrollToBottom = useCallback((smooth = false) => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom(status === "streaming");
    }
  }, [messages, scrollToBottom, status]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleScroll = () => {
    const node = transcriptRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 64;
  };

  const applyStreamEvent = useCallback((event: StreamEvent) => {
    const assistantId = activeAssistantIdRef.current;

    if (event.type === "token") {
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantId) return message;
          const parts = [...message.parts];
          const last = parts[parts.length - 1];
          if (last && last.kind === "text") {
            parts[parts.length - 1] = { kind: "text", text: last.text + event.chunk };
          } else {
            parts.push({ kind: "text", text: event.chunk });
          }
          return { ...message, parts };
        }),
      );
      return;
    }

    if (event.type === "tool-start") {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                parts: [
                  ...message.parts,
                  {
                    kind: "tool",
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    state: "input-streaming",
                    inputText: "",
                  } satisfies ToolPart,
                ],
              }
            : message,
        ),
      );
      return;
    }

    if (event.type === "tool-input-delta") {
      setMessages((current) =>
        updateToolPart(current, assistantId, event.toolCallId, (part) => ({
          ...part,
          inputText: part.inputText + event.delta,
        })),
      );
      return;
    }

    if (event.type === "tool-input-available") {
      setMessages((current) =>
        updateToolPart(current, assistantId, event.toolCallId, (part) => ({
          ...part,
          state: "input-available",
          input: event.input,
        })),
      );
      return;
    }

    if (event.type === "tool-output-available") {
      setMessages((current) =>
        updateToolPart(current, assistantId, event.toolCallId, (part) => ({
          ...part,
          state: "output-available",
          output: event.output,
        })),
      );
      return;
    }

    if (event.type === "tool-output-error") {
      setMessages((current) =>
        updateToolPart(current, assistantId, event.toolCallId, (part) => ({
          ...part,
          state: "output-error",
          errorText: event.error,
        })),
      );
      return;
    }

    if (event.type === "done") {
      setIsStreaming(false);
      setStatus("idle");
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantId) return message;
          return {
            ...message,
            parts: hasVisiblePart(message.parts) ? message.parts : [{ kind: "no-result" }],
            streaming: false,
          };
        }),
      );
      activeAssistantIdRef.current = null;
      abortRef.current = null;
      return;
    }

    if (event.type === "error") {
      setFailure({
        title: "Chat failed",
        message: event.message,
        retryPrompt: lastUserPromptRef.current ?? undefined,
      });
      setIsStreaming(false);
      setStatus("idle");
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantId) return message;
          const parts = [...message.parts];
          if (!hasVisiblePart(parts)) parts.push({ kind: "no-result" });
          return { ...message, parts, streaming: false };
        }),
      );
      activeAssistantIdRef.current = null;
      abortRef.current = null;
    }
  }, []);

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeAssistantIdRef.current = null;
    setIsStreaming(false);
    setStatus("idle");
    setMessages((current) =>
      current.map((message) => (message.streaming ? { ...message, streaming: false } : message)),
    );
  };

  const sendMessage = useCallback(async (prompt: string, options?: { keepDraft?: boolean }) => {
    const trimmed = prompt.trim();
    if (!trimmed || isStreaming) {
      if (!trimmed) setDraftHint("Type a message before sending.");
      return;
    }

    setFailure(null);
    setDraftHint(null);
    if (!options?.keepDraft) setDraft("");
    setIsStreaming(true);
    setStatus("thinking");
    lastUserPromptRef.current = trimmed;

    const userMessage: ChatMessage = {
      id: createId("user"),
      role: "user",
      parts: [{ kind: "text", text: trimmed }],
    };

    const assistantMessage: ChatMessage = {
      id: createId("assistant"),
      role: "assistant",
      parts: [],
      streaming: true,
    };

    activeAssistantIdRef.current = assistantMessage.id;

    setMessages((current) => [...current, userMessage, assistantMessage]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const conversation = [...messages, userMessage]
        .filter((message) => message.id !== "assistant-welcome")
        .map((message) => ({ role: message.role, content: textOf(message) }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        const routeMessage =
          detail && typeof detail.error === "string"
            ? detail.error
            : "The chat route did not return a usable stream.";
        throw new Error(routeMessage);
      }

      setStatus("streaming");
      await readStream(response, applyStreamEvent);
    } catch (thrown) {
      if (thrown instanceof DOMException && thrown.name === "AbortError") {
        setStatus("idle");
        setIsStreaming(false);
        return;
      }

      const message = thrown instanceof Error ? thrown.message : "Something interrupted the stream.";
      setFailure({
        title: "Chat failed",
        message,
        retryPrompt: trimmed,
      });
      setStatus("idle");
      setIsStreaming(false);
      setMessages((current) =>
        current.map((item) =>
          item.id === activeAssistantIdRef.current
            ? {
                ...item,
                parts: hasVisiblePart(item.parts) ? item.parts : [{ kind: "no-result" }],
                streaming: false,
              }
            : item,
        ),
      );
      activeAssistantIdRef.current = null;
      abortRef.current = null;
    }
  }, [isStreaming, messages, applyStreamEvent]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage(draft);
  };

  const retryLastMessage = () => {
    const prompt = failure?.retryPrompt ?? lastUserPromptRef.current;
    if (prompt) void sendMessage(prompt, { keepDraft: true });
  };

  return (
    <section className="chat-section" id="chat">
      <div className="hero-grid">
        <article className="hero-panel">
          <p className="eyebrow">FE-11 / Production deployment and README</p>
          <div className="hero-copy">
            <h2>Tool calls that render as real UI, not JSON.</h2>
            <p>
              The server route calls a typed <code>scoreLead</code> tool, streams every lifecycle
              state back over SSE, and the client renders each state distinctly — including a
              designed failure state instead of a crash. The public route also
              caps request volume and prompt size before it reaches the model.
            </p>
          </div>
          <div className="hero-card">
            <div className="hero-stat">
              <div>
                <strong>Server tool</strong>
                <span className="chat-meta">Zod-validated scoreLead, defined once and shared.</span>
              </div>
              <span className="badge">/lib/tools/score-lead.ts</span>
            </div>
            <div className="hero-stat">
              <div>
                <strong>Tool lifecycle</strong>
                <span className="chat-meta">input-streaming to input-available to output.</span>
              </div>
              <span className="badge">4 states</span>
            </div>
            <div className="hero-stat">
              <div>
                <strong>Conversation state</strong>
                <span className="chat-meta">History stays intact across multiple turns.</span>
              </div>
              <span className="badge">{conversationCount} turns</span>
            </div>
            <div className="hero-stat">
              <div>
                <strong>Production hygiene</strong>
                <span className="chat-meta">Server-only API key, rate cap, and input limits.</span>
              </div>
              <span className="badge">FE-11</span>
            </div>
          </div>
        </article>

        <aside className="assistant-panel">
          <header>
            <div>
              <p className="panel-subtitle">What to test</p>
              <h3>How the preview behaves</h3>
            </div>
          </header>

          <div className="hero-card">
            <p className="stream-hint">
              Ask something like &ldquo;score a lead named Priya Anand at Meridian Robotics with a
              $120k budget&rdquo; to watch the tool run end to end. Ask for a negative budget to see
              the designed error state instead of a crash.
            </p>
            <ul className="conversation-summary">
              <li>Tool arguments stream in live as raw JSON before they&apos;re valid.</li>
              <li>Once parsed, the tool runs and renders a real score card — not text.</li>
              <li>A failed tool call renders a dedicated error card.</li>
            </ul>
          </div>
        </aside>
      </div>

      <div className="chat-shell">
        <article className="chat-panel">
          <header>
            <div>
              <p className="panel-subtitle">Live transcript</p>
              <h2>Hold a streaming conversation</h2>
            </div>
            <div className="chat-status-row">
              <span className="status-dot" aria-hidden="true" />
              <span className="chat-meta">
                {status === "thinking"
                  ? "Thinking..."
                  : status === "streaming"
                    ? "Streaming tokens"
                    : "Ready"}
              </span>
            </div>
          </header>

          {failure ? (
            <ChatErrorCard
              failure={failure}
              onRetry={retryLastMessage}
              retryDisabled={isStreaming}
            />
          ) : null}

          <div
            className="transcript"
            ref={transcriptRef}
            onScroll={handleScroll}
            aria-label="Conversation transcript"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages.map((message) => (
              <ChatMessageView key={message.id} message={message} />
            ))}
          </div>

          <form className="composer" aria-label="Chat composer" onSubmit={handleSubmit}>
            <label htmlFor="message">
              Message
              <span className="composer-help">
                Try a lead to score, or ask a normal question to see plain streaming.
              </span>
            </label>
            <textarea
              id="message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder='Try: "Score a lead named Priya Anand at Meridian Robotics with a $120k budget."'
              rows={4}
              disabled={isStreaming && status === "thinking"}
            />
            {draftHint ? <p className="composer-hint" role="status">{draftHint}</p> : null}

            <div className="composer-actions">
              <p className="composer-help">
                Tool contract lives in <code>src/lib/tools/score-lead.ts</code>.
              </p>
              <div className="button-row">
                {isStreaming ? (
                  <button type="button" className="button" onClick={stopStreaming}>
                    Stop stream
                  </button>
                ) : null}
                <button type="submit" className="button button-primary" disabled={!draft.trim()}>
                  Send message
                </button>
              </div>
            </div>
          </form>
        </article>

        <aside className="assistant-panel">
          <header>
            <div>
              <p className="panel-subtitle">Build notes</p>
              <h3>What the reviewer should look for</h3>
            </div>
          </header>

          <div className="hero-card">
            <ul className="conversation-summary">
              <li>Route handler streams real Anthropic tool_use blocks when a server key exists.</li>
              <li>Fallback mode still runs the real scoreLead function without a key.</li>
              <li>Each of the four tool states gets distinct visual treatment.</li>
              <li>A failed scoreLead call renders a designed error card, never a crash.</li>
            </ul>
          </div>

          <div className="hero-card">
            <h4>Suggested prompts</h4>
            <ul className="conversation-summary">
              <li>&ldquo;Score a lead named Priya Anand at Meridian Robotics, budget $120k.&rdquo;</li>
              <li>&ldquo;Score a lead named Sam at Acme with a budget of -5000.&rdquo;</li>
              <li>&ldquo;Explain the difference between the server route and the client.&rdquo;</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
