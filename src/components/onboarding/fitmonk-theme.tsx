import "@/styles/fitmonk-onboarding.css";

// Archivo/Hanken Grotesk are now loaded once by the root layout
// (src/app/layout.tsx) as the app's global fonts, so this just applies the
// .fm-theme class for the onboarding/paywall component styles — no separate
// font loading needed here anymore.
export function FitmonkTheme({ children }: { children: React.ReactNode }) {
  return <div className="fm-theme">{children}</div>;
}
