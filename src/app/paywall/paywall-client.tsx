"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Crown, LoaderCircle, X } from "lucide-react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { bridgeErrorCode, nativeBridge, type StoreProduct } from "@/lib/native-bridge";
import { activeTierFromEntitlements, productIdFor } from "@/lib/store-billing";
import {
  formatInr,
  priceFor,
  trialDaysFor,
  yearlySavingsPct,
  type BillingDuration,
} from "@/lib/pricing";
import { AppLoader, WELCOME_MS } from "@/components/ui/app-loader";
import { cn } from "@/lib/utils";
import { storePhrase, type StoreHost } from "@/lib/paywall-store-host";
import type { SubscriptionTier } from "@/lib/types";

const WELCOME_LINE = "The beginning of a healthier you";

type TierDefinition = {
  v: SubscriptionTier;
  name: string;
  features: string[];
};

// Features in order per design handoff README. Starter has 5, Pro has 4,
// Elite has 5. Each line must fit on one row at 13px; if a translated string
// grows, shorten the copy rather than wrapping.
const TIERS: TierDefinition[] = [
  {
    v: "starter",
    name: "Starter",
    features: [
      "Diet tracking",
      "Workout Plans (Gym)",
      "Weight and Sets tracking",
      "AI Coach",
      "Challenges",
    ],
  },
  {
    v: "pro",
    name: "Pro",
    features: [
      "Everything in Starter",
      "Adaptive Workout Sessions",
      "Home workouts",
      "Personalized Diet Plan",
    ],
  },
  {
    v: "elite",
    name: "Elite",
    features: [
      "Everything in Pro",
      "Monthly 1-on-1 call with a trainer",
      "Trainer refines your plan every month",
      "Early access to new features",
      "Priority human support",
    ],
  },
];

const TIER_RANK: Record<SubscriptionTier, number> = { starter: 0, pro: 1, elite: 2 };

const PENDING_LINE =
  "Your payment is pending. Your plan unlocks automatically as soon as the store confirms it.";
const UNAVAILABLE_LINE = "Subscriptions aren't available right now. Please try again shortly.";

type UpgradeFeature =
  | "diet-plan"
  | "adaptive-coach"
  | "trainer-call"
  | "home-workouts";

type FeatureCopy = {
  title: string;
  subtitle: string;
  requiredTier: SubscriptionTier;
  // Optional hero banner shown above the title. Asset lives under
  // public/paywall/. Drop a file at the matching path and it renders.
  // Portrait photos should set `objectPosition` (e.g. "center top") so the
  // subject stays in the 3:2 crop.
  heroImage?: { src: string; alt: string; objectPosition?: string };
};

const FEATURE_COPY: Record<UpgradeFeature, FeatureCopy> = {
  "diet-plan": {
    title: "Unlock your personalized diet plan",
    subtitle: "The personalized diet plan is a Pro feature. Switch or cancel anytime.",
    requiredTier: "pro",
    heroImage: {
      src: "/paywall/diet-plan-hero.png",
      alt: "Weekly diet plan with fresh fruits and vegetables",
    },
  },
  "adaptive-coach": {
    title: "Adaptive workout sessions",
    subtitle:
      "Pro reshapes today's home workout to match your readiness check. Switch or cancel anytime.",
    requiredTier: "pro",
    heroImage: {
      src: "/paywall/adaptive-coach-hero.png",
      alt: "Woman checking her heart rate on a smartwatch mid-session",
    },
  },
  "trainer-call": {
    title: "Talk to a real trainer",
    subtitle: "The monthly 1-on-1 call is an Elite feature. Switch or cancel anytime.",
    requiredTier: "elite",
    heroImage: {
      src: "/paywall/trainer-call-hero.png",
      alt: "Trainer coaching through a phone on a tripod",
      // Portrait photo — keep the trainer's face anchored to the top of the
      // 3:2 crop instead of centering (which would drop her face below the
      // frame).
      objectPosition: "center top",
    },
  },
  "home-workouts": {
    title: "Unlock Home workouts",
    subtitle: "Guided home sessions are a Pro feature. Switch or cancel anytime.",
    requiredTier: "pro",
    heroImage: {
      src: "/paywall/home-workouts-hero.png",
      alt: "Home workout session in a living room",
    },
  },
};

function parseFeature(value: string | null): UpgradeFeature | null {
  return value === "diet-plan" ||
    value === "adaptive-coach" ||
    value === "trainer-call" ||
    value === "home-workouts"
    ? value
    : null;
}

type Props = {
  storeHost: StoreHost;
};

export default function PaywallClient({ storeHost }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, hydrated, unlockPaywall } = useDietFit();

  const isUpgrade = searchParams.get("upgrade") === "1";
  const returnParam = searchParams.get("return");
  const returnTo = returnParam && returnParam.startsWith("/") ? returnParam : "/workout";
  const feature = parseFeature(searchParams.get("feature"));
  const featureCopy = feature ? FEATURE_COPY[feature] : null;
  const currentTier: SubscriptionTier = state.subscriptionTier ?? "starter";

  // Upgrade mode only exposes tiers above the current one; signup shows all.
  const visibleTiers = useMemo(
    () =>
      isUpgrade
        ? TIERS.filter((tier) => TIER_RANK[tier.v] > TIER_RANK[currentTier])
        : TIERS,
    [isUpgrade, currentTier],
  );

  const upgradeDefault: SubscriptionTier =
    (featureCopy && visibleTiers.some((tier) => tier.v === featureCopy.requiredTier)
      ? featureCopy.requiredTier
      : visibleTiers[0]?.v) ?? "elite";

  // Signup default: Elite is the hero, but if the user picked Home at
  // onboarding we pre-select Pro so the plan that unlocks their chosen
  // environment reads as the recommended one.
  const signupDefault: SubscriptionTier =
    state.profile?.workoutEnvironment === "home" ? "pro" : "elite";

  // Once the user taps a card, honour that choice even if the profile hydrates
  // later with a value that would otherwise swap the default back under them.
  // Until then the selection follows the (possibly still hydrating) default.
  const [pickedPlan, setPickedPlan] = useState<SubscriptionTier | null>(null);
  const plan: SubscriptionTier = pickedPlan ?? (isUpgrade ? upgradeDefault : signupDefault);
  const [duration, setDuration] = useState<BillingDuration>("quarterly");
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreToast, setRestoreToast] = useState<string | null>(null);
  // Shows the welcome loader for a beat after purchase, while /workout
  // prefetches, so the first paint of the app reads as a welcome instead of
  // a flash of blank.
  const [welcoming, setWelcoming] = useState(false);
  // Localized prices from the App Store / Play, keyed by Qonversion product
  // id. Empty on the web or until the store answers; the INR list prices
  // show until then.
  const [storeProducts, setStoreProducts] = useState<Record<string, StoreProduct>>({});

  useEffect(() => {
    if (!nativeBridge.isNative) {
      return;
    }
    let cancelled = false;
    nativeBridge.purchases
      .getProducts()
      .then((result) => {
        if (!cancelled && result.available) setStoreProducts(result.products);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!state.onboardingCompleted) {
      router.replace("/onboarding");
      return;
    }
    if (state.paywallCompleted && !isUpgrade && !welcoming) {
      router.replace("/workout");
      return;
    }
    if (isUpgrade && visibleTiers.length === 0) {
      router.replace(returnTo);
    }
  }, [
    hydrated,
    router,
    state.onboardingCompleted,
    state.paywallCompleted,
    isUpgrade,
    visibleTiers.length,
    returnTo,
    welcoming,
  ]);

  useEffect(() => {
    if (!welcoming) {
      return;
    }
    router.prefetch("/workout");
    const timer = window.setTimeout(
      () => router.replace("/workout"),
      WELCOME_MS,
    );
    return () => window.clearTimeout(timer);
  }, [router, welcoming]);

  if (welcoming) {
    return <AppLoader message={WELCOME_LINE} durationMs={WELCOME_MS} />;
  }

  if (
    !hydrated ||
    !state.onboardingCompleted ||
    (state.paywallCompleted && !isUpgrade) ||
    (isUpgrade && visibleTiers.length === 0)
  ) {
    return <AppLoader />;
  }

  const selectedTier =
    visibleTiers.find((tier) => tier.v === plan) ?? visibleTiers[0] ?? TIERS[2];
  const selectedPrice = priceFor(selectedTier.v, duration);
  const trialDays = trialDaysFor(selectedTier.v, duration);
  const isYearly = duration === "yearly";
  const periodShort = isYearly ? "yr" : "qtr";

  function handleClose() {
    setError(null);
    if (isUpgrade) {
      router.push(returnTo);
    } else {
      router.push("/why-fitmonk");
    }
  }

  function completeWithTier(tier: SubscriptionTier) {
    flushSync(() => {
      unlockPaywall(tier);
    });
    if (isUpgrade) {
      router.push(returnTo);
    } else {
      setWelcoming(true);
    }
  }

  async function handleRestore() {
    setError(null);
    setRestoreToast(null);
    if (!nativeBridge.isNative) {
      setRestoreToast("Restore Purchases works in the Fitmonk app on your phone.");
      return;
    }
    try {
      const result = await nativeBridge.purchases.restore();
      const tier = activeTierFromEntitlements(result);
      if (!tier) {
        setRestoreToast("No active subscription found for this Apple ID / Google account.");
        return;
      }
      if (isUpgrade && TIER_RANK[tier] <= TIER_RANK[currentTier]) {
        setRestoreToast(`Your ${tier} plan is already active.`);
        return;
      }
      setRestoreToast("Subscription restored.");
      completeWithTier(tier);
    } catch (restoreError) {
      setRestoreToast(
        bridgeErrorCode(restoreError) === "purchases_unavailable"
          ? UNAVAILABLE_LINE
          : "Couldn't reach the store to restore. Check your connection and try again.",
      );
    }
  }

  async function handlePurchase() {
    if (purchasing) {
      return;
    }
    setPurchasing(true);
    setError(null);
    setRestoreToast(null);

    // The website has no store billing; it keeps the existing open unlock.
    // Inside the app every plan is bought through the App Store (StoreKit)
    // or Google Play Billing, and only an active entitlement unlocks it.
    if (!nativeBridge.isNative) {
      completeWithTier(selectedTier.v);
      return;
    }

    try {
      const result = await nativeBridge.purchases.purchase(
        productIdFor(selectedTier.v, duration),
      );
      const tier = activeTierFromEntitlements(result);
      if (!tier) {
        setError(
          "Payment received, but your plan isn't active yet. Tap Restore Purchases in a moment.",
        );
        setPurchasing(false);
        return;
      }
      completeWithTier(TIER_RANK[tier] >= TIER_RANK[selectedTier.v] ? tier : selectedTier.v);
    } catch (purchaseError) {
      const code = bridgeErrorCode(purchaseError);
      if (code === "purchase_cancelled") {
        // The user closed the store sheet: nothing to report.
      } else if (code === "purchase_pending") {
        setRestoreToast(PENDING_LINE);
      } else if (code === "purchases_unavailable" || code === "product_not_found") {
        setError(UNAVAILABLE_LINE);
      } else {
        setError("Payment didn't go through. Try again.");
      }
      setPurchasing(false);
    }
  }

  const storePrice = storeProducts[productIdFor(selectedTier.v, duration)]?.prettyPrice ?? null;

  const title = isUpgrade ? featureCopy?.title ?? "Choose your plan" : "Choose your plan";

  // The store's own localized price wins over the INR list price: it's what
  // the App Store / Play sheet will actually charge in the user's country.
  const priceLabel = storePrice ?? formatInr(selectedPrice.total);

  const ctaLabel = isYearly
    ? `Start ${trialDays}-day free trial`
    : `Start with ${selectedTier.name} · ${priceLabel}/${periodShort}`;
  const ctaSubLine = isYearly ? `Then ${priceLabel}/yr` : null;

  const store = storePhrase(storeHost);
  const renewalLine = isYearly
    ? `Free for ${trialDays} days, then ${priceLabel} every year until cancelled. Cancel in ${store} before day ${trialDays} to avoid the charge.`
    : `Renews every 3 months at ${priceLabel} until cancelled. Cancel anytime in ${store}.`;

  return (
    <div
      className="relative mx-auto flex min-h-screen w-full max-w-[460px] flex-col bg-[#0F4038] text-white"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Header has three shapes:
          - Upgrade WITH hero image: full-bleed photo at the top, the X floats
            on it, and a gradient fades the image's bottom edge into the
            paywall's #0F4038 so title + subtitle below read as one piece.
          - Upgrade without hero: dedicated X row above a centred title.
          - Signup: the short "Choose your plan" rides the X row centred. */}
      {isUpgrade && featureCopy?.heroImage ? (
        <div className="relative">
          <div className="relative aspect-[3/2] w-full overflow-hidden">
            <Image
              src={featureCopy.heroImage.src}
              alt={featureCopy.heroImage.alt}
              fill
              sizes="(max-width: 460px) 100vw, 460px"
              className="object-cover"
              style={{ objectPosition: featureCopy.heroImage.objectPosition ?? "center" }}
              priority
            />
            {/* Fade the bottom quarter of the hero into #0F4038 so the title
                area below reads as a continuous surface. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(15,64,56,0) 55%, rgba(15,64,56,0.55) 80%, #0F4038 100%)",
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute left-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm"
            style={{ top: "max(12px, env(safe-area-inset-top))" }}
          >
            <X className="h-5 w-5 text-white" strokeWidth={2.25} />
          </button>
        </div>
      ) : isUpgrade ? (
        <div className="relative flex h-[52px] shrink-0 items-center px-4">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
          >
            <X className="h-5 w-5 text-white" strokeWidth={2.25} />
          </button>
        </div>
      ) : (
        <div className="relative flex h-[52px] shrink-0 items-center justify-center px-4">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Why Fitmonk?"
            className="absolute left-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/10"
          >
            <X className="h-5 w-5 text-white" strokeWidth={2.25} />
          </button>
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.01em] text-white">
            {title}
          </h1>
        </div>
      )}

      {isUpgrade ? (
        <>
          <h1 className="px-6 text-center font-display text-[24px] font-bold leading-tight tracking-[-0.01em] text-white">
            {title}
          </h1>
          {featureCopy ? (
            <p className="mt-2 px-5 text-center text-[13px] leading-[1.45] text-white/70">
              {featureCopy.subtitle}
            </p>
          ) : null}
        </>
      ) : null}

      {/* Billing toggle. */}
      <div className="mt-2 flex justify-center">
        <BillingToggle duration={duration} onChange={setDuration} />
      </div>

      {/* Plan card stack. */}
      <div
        className={cn(
          "mt-4 flex-1 overflow-y-auto px-4 pt-[12px]",
          "flex flex-col gap-[14px]",
        )}
      >
        {visibleTiers.map((tier) => (
          <PlanCard
            key={tier.v}
            tier={tier}
            duration={duration}
            selected={plan === tier.v}
            isUpgrade={isUpgrade}
            isRequired={Boolean(featureCopy && tier.v === featureCopy.requiredTier)}
            onSelect={() => {
              setPickedPlan(tier.v);
            }}
          />
        ))}
        <div className="h-2" />
      </div>

      {/* Footer: CTA + renewal + link row. */}
      <div
        className="shrink-0 px-4 pb-[22px] pt-3"
        style={{ paddingBottom: "calc(22px + env(safe-area-inset-bottom))" }}
      >
        {error ? (
          <p className="mb-2 text-center text-[12px] font-semibold text-[#FFB4A8]">
            {error}
          </p>
        ) : null}
        {restoreToast ? (
          <p className="mb-2 text-center text-[12px] font-semibold text-white/75">
            {restoreToast}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handlePurchase}
          disabled={purchasing}
          className={cn(
            "flex w-full min-h-[54px] flex-col items-center justify-center gap-[1px] rounded-full bg-[#F2843A] px-5 py-[7px] text-[#0E2320] transition-opacity",
            purchasing ? "opacity-70" : "active:scale-[0.985]",
          )}
        >
          {purchasing ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <span className="font-sans text-[16px] font-extrabold leading-tight">
                {ctaLabel}
              </span>
              {ctaSubLine ? (
                <span className="font-sans text-[12px] font-bold leading-tight text-[#0E2320]/80">
                  {ctaSubLine}
                </span>
              ) : null}
            </>
          )}
        </button>

        <p className="mt-[14px] text-center text-[12px] leading-[1.45] text-white/70">
          {renewalLine}
        </p>

        <div className="mt-[2px] flex items-center justify-center gap-1 text-[12px] text-white/60">
          <Link
            href="/terms"
            className="min-h-[32px] px-[6px] py-[6px] font-semibold text-white/60 underline underline-offset-2 hover:text-white"
          >
            Terms
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/privacy"
            className="min-h-[32px] px-[6px] py-[6px] font-semibold text-white/60 underline underline-offset-2 hover:text-white"
          >
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={handleRestore}
            className="min-h-[32px] px-[6px] py-[6px] font-semibold text-white/60 underline underline-offset-2 hover:text-white"
          >
            Restore Purchases
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Billing toggle
// ────────────────────────────────────────────────────────────────────────────

function BillingToggle({
  duration,
  onChange,
}: {
  duration: BillingDuration;
  onChange: (next: BillingDuration) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Billing duration"
      className="inline-flex items-center gap-[2px] rounded-full border border-[rgba(21,181,155,0.6)] bg-transparent p-[3px]"
    >
      {(["quarterly", "yearly"] as BillingDuration[]).map((option) => {
        const active = duration === option;
        const label = option === "quarterly" ? "Quarterly" : "Yearly";
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option)}
            className={cn(
              "flex h-7 items-center justify-center rounded-full px-4 font-sans text-[12px] font-extrabold uppercase tracking-[0.01em] transition-colors",
              active
                ? "bg-[#15B59B] text-[#0E2320]"
                : "text-white/80",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Plan card
// ────────────────────────────────────────────────────────────────────────────

function PlanCard({
  tier,
  duration,
  selected,
  isUpgrade,
  isRequired,
  onSelect,
}: {
  tier: TierDefinition;
  duration: BillingDuration;
  selected: boolean;
  isUpgrade: boolean;
  isRequired: boolean;
  onSelect: () => void;
}) {
  const price = priceFor(tier.v, duration);
  const isYearly = duration === "yearly";
  const periodShort = isYearly ? "yr" : "qtr";
  const trialDays = trialDaysFor(tier.v, duration);
  const savePct = isYearly ? yearlySavingsPct(tier.v) : 0;
  const isPro = tier.v === "pro";
  const isElite = tier.v === "elite";

  // Any tier takes the sand + orange-stroke treatment when selected. Unselected
  // cards fall back to the ladder tints: Pro keeps its brighter green, Elite
  // and Starter stay as quieter dark cards.
  const useSandSurface = selected;

  const surfaceClasses = useSandSurface
    ? "bg-[#F7F1E6] border-[2px] border-[#F2843A] p-[10px_13px] text-[#33463F]"
    : isElite
      ? "bg-white/[0.06] border border-white/[0.16] p-[11px_14px]"
      : isPro
        ? "bg-white/[0.16] border-[1.5px] border-[rgba(21,181,155,0.7)] p-[10.5px_13.5px]"
        : "bg-white/[0.03] border border-white/[0.10] p-[11px_14px]";

  const nameClass = useSandSurface ? "text-[#0E2320]" : "text-white";
  const priceClass = useSandSurface ? "text-[#0E2320]" : "text-white";
  const priceSuffixClass = useSandSurface ? "text-[#0E2320]/70" : "text-white/70";
  const perMonthClass = useSandSurface ? "text-[#0E2320]/70" : "text-white/70";
  const featureTextClass = useSandSurface
    ? "text-[#33463F]"
    : isPro
      ? "text-white/85"
      : "text-white/70";
  const checkClass = useSandSurface ? "text-[#C5631F]" : "text-[#15B59B]";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col gap-[6px] rounded-[16px] text-left transition-colors",
        surfaceClasses,
      )}
    >
      {/* Save x% ribbon — only on yearly, sits on the top edge. */}
      {isYearly && savePct > 0 ? (
        <span
          className="absolute right-[14px] -top-[10px] rounded-full bg-[#F2843A] px-[9px] py-0 text-[10px] font-extrabold uppercase leading-5 tracking-[0.03em] text-[#0E2320] ring-2 ring-[#0F4038]"
        >
          Save {savePct}%
        </span>
      ) : null}

      {/* Header row: name + chips (and trial pill) on the left, price block on the right. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[4px]">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-[6px]">
            {isElite ? (
              <Crown
                className="h-[17px] w-[17px] shrink-0 text-[#F2843A]"
                strokeWidth={2}
              />
            ) : null}
            <span
              className={cn(
                "font-display text-[17px] font-bold leading-[22px]",
                nameClass,
              )}
            >
              {tier.name}
            </span>
            {isRequired ? (
              <span className="inline-flex items-center rounded-full bg-[#15B59B] px-2 py-[3px] font-sans text-[10px] font-extrabold uppercase tracking-[0.05em] text-[#0E2320]">
                Required
              </span>
            ) : isPro && !isUpgrade ? (
              <span className="inline-flex items-center rounded-full bg-[#15B59B] px-2 py-[3px] font-sans text-[10px] font-extrabold uppercase tracking-[0.05em] text-[#0E2320]">
                Most popular
              </span>
            ) : null}
          </div>

          {/* 7 days free pill on yearly — sits directly under the name so the
              taller price column on the right doesn't push it down. */}
          {trialDays > 0 ? (
            <span
              className={cn(
                "inline-flex w-fit items-center rounded-full border px-[7px] py-[2px] font-sans text-[9.5px] font-extrabold uppercase tracking-[0.03em]",
                useSandSurface
                  ? "border-[#8FDCCB] bg-[#D6F4EC] text-[#0B6E5E]"
                  : "border-[rgba(21,181,155,0.55)] bg-[rgba(21,181,155,0.18)] text-[#7FE3CF]",
              )}
            >
              {trialDays} days free
            </span>
          ) : null}
        </div>

        <div className="flex-none text-right">
          <div className="whitespace-nowrap">
            <span
              className={cn(
                "font-display text-[19px] font-bold leading-none",
                priceClass,
              )}
            >
              {formatInr(price.total)}
            </span>
            <span
              className={cn(
                "font-sans text-[11px] font-bold",
                priceSuffixClass,
              )}
            >
              /{periodShort}
            </span>
          </div>
          <div
            className={cn(
              "mt-[2px] font-sans text-[11px] font-bold",
              perMonthClass,
            )}
          >
            {formatInr(price.perMonth)}/mo
          </div>
        </div>
      </div>

      {/* Feature list — one line each, 13px. */}
      <ul className="mt-[2px] grid gap-[2px]">
        {tier.features.map((label) => (
          <li
            key={label}
            className={cn(
              "flex min-w-0 items-start gap-[8px] font-sans text-[13px] font-semibold leading-[16px]",
              featureTextClass,
            )}
          >
            <Check
              className={cn("mt-[1px] h-[13px] w-[13px] shrink-0", checkClass)}
              strokeWidth={3}
            />
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

