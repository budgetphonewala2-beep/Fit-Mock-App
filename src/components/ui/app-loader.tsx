import Image from "next/image";

// How long the welcome line stays up before the app opens.
export const WELCOME_MS = 1800;

// Full-screen brand loader used while the app is hydrating local state or
// waiting on the Firebase remote fetch after sign-in. Deep-teal ground matches
// the sign-in / onboarding surfaces so a returning user doesn't get a jarring
// flash of light UI before the app shell mounts. Respects reduced-motion by
// falling back to a still logo.
//
// Also covers redirects between screens, so nobody sees a blank page while
// the next one loads. `message` adds a line under the logo; `durationMs`
// swaps the dots for a progress bar when the wait has a known length (the
// welcome after the paywall).
export function AppLoader({
  message,
  durationMs,
}: { message?: string; durationMs?: number } = {}) {

  return (
    <div
      role="status"
      aria-label="Loading Fitmonk"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(ellipse_at_top,#0e4b45_0%,#07302c_65%,#051d1a_100%)]"
    >
      <style>{`
        @keyframes app-loader-breathe {
          0%, 100% { transform: scale(0.94); opacity: 0.82; }
          50% { transform: scale(1); opacity: 1; }
        }
        @keyframes app-loader-glow {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50% { opacity: 0.85; transform: scale(1.08); }
        }
        @keyframes app-loader-dot {
          0%, 80%, 100% { opacity: 0.28; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }
        .app-loader-logo { animation: app-loader-breathe 2.4s ease-in-out infinite; }
        .app-loader-glow { animation: app-loader-glow 2.4s ease-in-out infinite; }
        .app-loader-dot { animation: app-loader-dot 1.4s ease-in-out infinite; }
        .app-loader-dot:nth-child(2) { animation-delay: 0.18s; }
        .app-loader-dot:nth-child(3) { animation-delay: 0.36s; }
        @keyframes app-loader-line {
          0% { opacity: 0; transform: translateY(8px); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes app-loader-bar {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .app-loader-line { animation: app-loader-line 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .app-loader-bar { transform-origin: left; animation: app-loader-bar var(--app-loader-total) cubic-bezier(0.4, 0, 0.2, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .app-loader-logo,
          .app-loader-glow,
          .app-loader-dot,
          .app-loader-line,
          .app-loader-bar { animation: none; }
        }
      `}</style>

      <div className="flex flex-col items-center gap-8">
        <div className="relative flex items-center justify-center">
          {/* Soft mint aura behind the mark; scales in step with the logo
              breath so the whole composition feels like one gesture. */}
          <div
            aria-hidden
            className="app-loader-glow absolute h-[240px] w-[240px] rounded-full"
            style={{
              background:
                "radial-gradient(circle at center, rgba(55,201,166,0.28) 0%, rgba(55,201,166,0) 62%)",
              filter: "blur(18px)",
            }}
          />
          <Image
            src="/fitmonk-lockup-on-dark.png"
            alt=""
            width={1168}
            height={320}
            priority
            className="app-loader-logo relative h-auto w-[220px] select-none drop-shadow-[0_14px_34px_rgba(7,48,44,0.55)]"
          />
        </div>

        {message ? (
          <p
            aria-live="polite"
            className="app-loader-line -mb-3 min-h-[28px] px-8 text-center text-[20px] font-medium tracking-[-0.01em] text-white/92"
          >
            {message}
          </p>
        ) : null}

        {durationMs ? (
          <div className="h-[3px] w-[140px] overflow-hidden rounded-full bg-white/12" aria-hidden>
            <div
              className="app-loader-bar h-full w-full rounded-full bg-[#37c9a6]"
              style={{ ["--app-loader-total" as string]: `${durationMs}ms` }}
            />
          </div>
        ) : (
          <div className="flex gap-1.5" aria-hidden>
            <span className="app-loader-dot h-1.5 w-1.5 rounded-full bg-[#37c9a6]" />
            <span className="app-loader-dot h-1.5 w-1.5 rounded-full bg-[#37c9a6]" />
            <span className="app-loader-dot h-1.5 w-1.5 rounded-full bg-[#37c9a6]" />
          </div>
        )}
      </div>

      <span className="sr-only">Loading Fitmonk…</span>
    </div>
  );
}
