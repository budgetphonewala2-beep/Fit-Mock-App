"use client";

import { useState } from "react";
import { CheckCircle2, Sparkles, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { cn } from "@/lib/utils";
import type { SubscriptionTier } from "@/lib/types";

const SESSION_KEY = "dietfit-tier-switcher-shown";

const tiers: Array<{
  tier: SubscriptionTier;
  title: string;
  label: string;
  description: string;
  perks: string[];
}> = [
  {
    tier: "starter",
    title: "Starter",
    label: "Standard plan",
    description: "Keep the normal workout plan and readiness history.",
    perks: ["Standard workouts", "Meal tracking", "Readiness logging"],
  },
  {
    tier: "pro",
    title: "Pro",
    label: "Adaptive plan",
    description: "Let readiness adjust today’s workout duration and difficulty.",
    perks: ["Adaptive workouts", "Lighter low-energy days", "Smarter coach context"],
  },
  {
    tier: "elite",
    title: "Elite",
    label: "Adaptive plan + coaching",
    description: "Everything in Pro, plus a monthly call with a trainer.",
    perks: ["Adaptive workouts", "Lighter low-energy days", "Monthly trainer call"],
  },
];

export function TierSessionSwitcher() {
  const {
    state: { subscriptionTier },
    setSubscriptionTier,
  } = useDietFit();
  const [open, setOpen] = useState(() =>
    typeof window === "undefined"
      ? false
      : !window.sessionStorage.getItem(SESSION_KEY),
  );

  const close = () => {
    window.sessionStorage.setItem(SESSION_KEY, "true");
    setOpen(false);
  };

  const chooseTier = (tier: SubscriptionTier) => {
    setSubscriptionTier(tier);
    close();
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 px-3 pb-3 backdrop-blur-sm md:items-center md:p-6">
      <div className="w-full max-w-lg rounded-hero border border-foreground/7 bg-white p-5 shadow-[0_24px_70px_rgba(12,39,35,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/70">
              Choose your experience
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">Pick today&apos;s tier</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Switch once per login session to test standard workouts against adaptive Pro/Elite workouts.
            </p>
          </div>
          <button
            aria-label="Close tier selector"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5 text-foreground/55 transition hover:text-foreground"
            type="button"
            onClick={close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {tiers.map((option) => {
            const selected = option.tier === subscriptionTier;

            return (
              <button
                key={option.tier}
                type="button"
                className={cn(
                  "rounded-card border p-4 text-left transition active:scale-[0.98]",
                  selected
                    ? "border-primary/30 bg-primary/8 ring-4 ring-primary/8"
                    : "border-foreground/8 bg-white hover:border-primary/20",
                )}
                onClick={() => chooseTier(option.tier)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xl font-semibold">{option.title}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary/70">
                      {option.label}
                    </div>
                  </div>
                  {option.tier === "pro" || option.tier === "elite" ? (
                    <Sparkles className="h-5 w-5 text-accent" />
                  ) : selected ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-5 text-muted">{option.description}</p>
                <div className="mt-4 grid gap-2">
                  {option.perks.map((perk) => (
                    <div key={perk} className="flex items-center gap-2 text-xs font-semibold text-muted">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      {perk}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <Button className="mt-5 w-full gap-2" onClick={close}>
          <Zap className="h-4 w-4" />
          Keep {tiers.find((option) => option.tier === subscriptionTier)?.title ?? "Starter"}
        </Button>
      </div>
    </div>
  );
}
