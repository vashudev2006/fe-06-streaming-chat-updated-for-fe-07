import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/about", label: "How it works" },
  { href: "/deploy", label: "Deploy" },
  { href: "/health", label: "Health" },
];

export function SiteNav() {
  return (
    <header className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 shadow-[0_24px_60px_rgba(19,32,38,0.06)] backdrop-blur-sm sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[var(--accent)] text-sm font-semibold text-white shadow-lg shadow-teal-900/10">
            FE
          </div>
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.32em] text-[var(--muted)]">
              Week 4 build core
            </p>
            <Link
              href="/"
              className="text-lg font-semibold tracking-[-0.02em] text-[var(--text)] transition hover:text-[var(--accent)]"
            >
              Streaming chat preview
            </Link>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
