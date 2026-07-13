import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Chat, ChatMessageView, type ChatMessage } from "@/components/chat";

const leadInput = {
  name: "Priya Anand",
  company: "Meridian Robotics",
  budget: 120_000,
};

const leadOutput = {
  score: 88,
  tier: "hot" as const,
  reasons: [
    "Budget supports a serious rollout.",
    "The company profile matches the ideal customer.",
  ],
};

describe("ChatMessageView", () => {
  it("renders a user text part inside a named article", () => {
    const message = {
      id: "user-1",
      role: "user",
      parts: [{ kind: "text", text: "Score this lead for me." }],
    } satisfies ChatMessage;

    render(<ChatMessageView message={message} />);

    const article = screen.getByRole("article", { name: /user message/i });
    expect(within(article).getByText("You")).toBeInTheDocument();
    expect(within(article).getByText("Score this lead for me.")).toBeInTheDocument();
  });

  it("renders the no-result fallback part", () => {
    const message = {
      id: "assistant-empty",
      role: "assistant",
      parts: [{ kind: "no-result" }],
    } satisfies ChatMessage;

    render(<ChatMessageView message={message} />);

    const article = screen.getByRole("article", { name: /assistant message/i });
    expect(within(article).getByText(/no result came back/i)).toBeInTheDocument();
    expect(within(article).getByText(/try asking for a shorter answer/i)).toBeInTheDocument();
  });

  it("renders a first-response skeleton for an empty streaming assistant message", () => {
    const message = {
      id: "assistant-live",
      role: "assistant",
      parts: [],
      streaming: true,
    } satisfies ChatMessage;

    render(<ChatMessageView message={message} />);

    const article = screen.getByRole("article", { name: /assistant message/i });
    expect(within(article).getByText("live")).toBeInTheDocument();
    expect(screen.getByLabelText(/waiting for first response/i)).toBeInTheDocument();
  });

  it("renders tool arguments while input is streaming", () => {
    const message = {
      id: "assistant-tool-building",
      role: "assistant",
      parts: [
        {
          kind: "tool",
          toolCallId: "call-1",
          toolName: "scoreLead",
          state: "input-streaming",
          inputText: '{"name": "Priya"',
        },
      ],
    } satisfies ChatMessage;

    render(<ChatMessageView message={message} />);

    const status = screen.getByRole("status", { name: /scorelead arguments streaming/i });
    expect(within(status).getByText(/calling scorelead/i)).toBeInTheDocument();
    expect(status).toHaveTextContent('"name": "Priya"');
  });

  it("renders parsed tool input while scoreLead is running", () => {
    const message = {
      id: "assistant-tool-running",
      role: "assistant",
      parts: [
        {
          kind: "tool",
          toolCallId: "call-2",
          toolName: "scoreLead",
          state: "input-available",
          inputText: JSON.stringify(leadInput),
          input: leadInput,
        },
      ],
    } satisfies ChatMessage;

    render(<ChatMessageView message={message} />);

    const status = screen.getByRole("status", { name: /scorelead running/i });
    expect(within(status).getByText(/running scorelead/i)).toBeInTheDocument();
    expect(within(status).getByText("Priya Anand")).toBeInTheDocument();
    expect(within(status).getByText("Meridian Robotics")).toBeInTheDocument();
    expect(within(status).getByText("$120,000")).toBeInTheDocument();
  });

  it("renders a successful tool output as a scoreLead result region", () => {
    const message = {
      id: "assistant-tool-output",
      role: "assistant",
      parts: [
        {
          kind: "tool",
          toolCallId: "call-3",
          toolName: "scoreLead",
          state: "output-available",
          inputText: JSON.stringify(leadInput),
          input: leadInput,
          output: leadOutput,
        },
      ],
    } satisfies ChatMessage;

    render(<ChatMessageView message={message} />);

    const card = screen.getByRole("region", { name: /scorelead result/i });
    expect(within(card).getByRole("heading", { name: "Priya Anand" })).toBeInTheDocument();
    expect(within(card).getByText("Hot lead")).toBeInTheDocument();
    expect(within(card).getByText("88")).toBeInTheDocument();
  });

  it("renders tool failures as alerts", () => {
    const message = {
      id: "assistant-tool-error",
      role: "assistant",
      parts: [
        {
          kind: "tool",
          toolCallId: "call-4",
          toolName: "scoreLead",
          state: "output-error",
          inputText: "",
          errorText: "Budget cannot be negative.",
        },
      ],
    } satisfies ChatMessage;

    render(<ChatMessageView message={message} />);

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(/scorelead failed/i)).toBeInTheDocument();
    expect(alert).toHaveTextContent("Budget cannot be negative.");
  });
});

describe("Chat composer", () => {
  it("validates blank submissions without calling the chat route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Chat />);

    fireEvent.submit(screen.getByRole("form", { name: /chat composer/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Type a message before sending.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
