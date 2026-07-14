"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Chat = dynamic(() => import("@/components/chat").then((mod) => mod.Chat), {
  loading: () => <ChatLoading />,
});

function ChatLoading() {
  return (
    <section
      className="chat-panel"
      id="chat"
      aria-labelledby="chat-loading-title"
      aria-live="polite"
    >
      <header>
        <div>
          <p className="panel-subtitle">Live transcript</p>
          <h2 id="chat-loading-title">Loading chat</h2>
        </div>
      </header>
      <div className="skeleton-card" aria-label="Preparing chat">
        <span className="skeleton-line skeleton-line--wide" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line--short" />
      </div>
    </section>
  );
}

export function LazyChat() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const loadChat = () => setShouldLoad(true);

    if (window.location.hash === "#chat") {
      loadChat();
      return;
    }

    const timeoutId = window.setTimeout(loadChat, 4000);
    window.addEventListener("hashchange", loadChat, { once: true });

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("hashchange", loadChat);
    };
  }, []);

  if (shouldLoad) {
    return <Chat />;
  }

  return (
    <section className="chat-panel" id="chat" aria-labelledby="chat-deferred-title">
      <header>
        <div>
          <p className="panel-subtitle">Live transcript</p>
          <h2 id="chat-deferred-title">Chat preview</h2>
        </div>
      </header>
      <p className="stream-hint">
        Preparing the conversation workspace.
      </p>
      <div>
        <button type="button" className="button button-primary" onClick={() => setShouldLoad(true)}>
          Open chat
        </button>
      </div>
    </section>
  );
}
