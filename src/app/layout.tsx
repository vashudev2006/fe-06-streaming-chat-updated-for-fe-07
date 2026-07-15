import "./globals.css";
import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: {
    default: "FE-11 Production Chat",
    template: "%s | FE-11 Production Chat",
  },
  description:
    "A production-ready streaming chat preview with server-side model config, abuse guards, and mobile-friendly conversation UI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8">
          <SiteNav />
          <main id="main-content" className="flex-1 py-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
