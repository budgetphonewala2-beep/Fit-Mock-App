import Link from "next/link";
import type { ReactNode } from "react";

interface LegalPageProps {
  title: string;
  effectiveDate: string;
  lead?: ReactNode;
  children: ReactNode;
}

// Standalone legal-page shell. Deliberately does NOT use the in-app
// onboarding shell, providers, or auth gates — Apple/Google reviewers and
// search crawlers must be able to reach /privacy and /terms without
// signing in, and this page should keep working even if the app shell
// changes underneath.
export function LegalPage({ title, effectiveDate, lead, children }: LegalPageProps) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[color:var(--border)] pb-6">
        <Link
          href="/"
          className="text-[13px] font-medium tracking-wide text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
        >
          ← Fitmonk
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-space-grotesk)] text-3xl font-bold text-[color:var(--foreground)] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Effective {effectiveDate}
        </p>
        {lead ? (
          <p className="mt-5 text-[15px] leading-relaxed text-[color:var(--foreground)]/85">
            {lead}
          </p>
        ) : null}
      </header>

      <article className="legal-prose flex-1 space-y-8 pb-16 text-[15px] leading-relaxed text-[color:var(--foreground)]/90">
        {children}
      </article>

      <footer className="mt-auto border-t border-[color:var(--border)] pt-6 text-sm text-[color:var(--muted)]">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/" className="hover:text-[color:var(--foreground)]">
            Home
          </Link>
          <Link href="/privacy" className="hover:text-[color:var(--foreground)]">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-[color:var(--foreground)]">
            Terms of Service
          </Link>
        </div>
      </footer>
    </main>
  );
}

interface LegalSectionProps {
  heading: string;
  children: ReactNode;
}

export function LegalSection({ heading, children }: LegalSectionProps) {
  return (
    <section>
      <h2 className="mb-3 font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-[color:var(--foreground)]">
        {heading}
      </h2>
      <div className="space-y-3 [&_a]:text-[color:var(--primary)] [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-[color:var(--primary-strong)] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_strong]:text-[color:var(--foreground)]">
        {children}
      </div>
    </section>
  );
}
