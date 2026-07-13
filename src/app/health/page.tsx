"use client";

import { useEffect, useState } from "react";

type HealthPayload = {
  ok: boolean;
  service: string;
  checkedAt: string;
  routes: string[];
};

export default function HealthPage() {
  const [data, setData] = useState<HealthPayload | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_60px_rgba(19,32,38,0.06)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
        Health
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">
        Basic route check
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--muted)]">
        This page confirms the app can still serve an internal JSON endpoint,
        which is helpful when a reviewer wants to verify the route layer quickly.
      </p>
      <pre className="mt-6 overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-sm leading-6">
        {data ? JSON.stringify(data, null, 2) : "Loading..."}
      </pre>
    </section>
  );
}
