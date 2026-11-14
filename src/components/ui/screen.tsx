import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Full-height page container. Replaces the `fm-screen` CSS class so the
 * same layout works for onboarding, sign-in, paywall and any in-app takeover.
 * `theme="dark"` swaps to the teal ground (used by sign-in and the celebration
 * takeovers); default is the cream/sand ground.
 */
type ScreenProps = React.HTMLAttributes<HTMLDivElement> & {
  theme?: "light" | "dark";
};

export function Screen({ theme = "light", className, ...props }: ScreenProps) {
  return (
    <div
      // `fm-screen--dark/--light` stays on the element so a few descendant
      // rules in fitmonk-onboarding.css (topbar chrome, eyebrow, sub, back
      // button hover) can still target dark-mode overrides without knowing
      // about the React component.
      className={cn(
        "flex min-h-screen flex-col",
        theme === "dark"
          ? "bg-teal-900 text-sand-100 fm-screen--dark"
          : "bg-sand-50 text-ink-900 fm-screen--light",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The scrolling middle section of a Screen. Matches the fm-* CSS lane:
 * centered column, max-width 440px, hidden scrollbar so the flow reads
 * as one page even on tall content.
 */
export function ScreenBody({
  className,
  center,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { center?: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-4 overflow-y-auto px-[var(--screen-pad-x)] pt-[var(--screen-pad-top)] pb-6",
        "max-w-[var(--content-max)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        center && "items-center text-center",
        className,
      )}
      {...props}
    />
  );
}

/** Fixed footer for primary/secondary CTAs. */
export function ScreenFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[var(--content-max)] flex-col gap-2.5 px-[var(--screen-pad-x)] pb-[var(--screen-pad-bottom)] pt-3.5",
        className,
      )}
      {...props}
    />
  );
}

/** Back-arrow + segmented progress row for onboarding-style flows. */
export function Topbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 px-[var(--screen-pad-x)] pt-2.5 pb-1.5",
        className,
      )}
      {...props}
    />
  );
}

/** Filler used inside ScreenBody to push content toward center vertically. */
export function ScreenGrow(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div className="flex-1" {...props} />;
}
