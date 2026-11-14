import type { SubscriptionTier } from "@/lib/types";

export type BillingDuration = "quarterly" | "yearly";

export const BILLING_MONTHS: Record<BillingDuration, number> = {
  quarterly: 3,
  yearly: 12,
};

/**
 * Rupees charged at the start of each billing period. The paywall and the
 * profile plan card both read from here, so a price change is one edit.
 * Monthly is intentionally not offered: the plan commits users to a real
 * cycle. Keep these in step with the Play Console subscription prices.
 */
export const PLAN_PRICES: Record<SubscriptionTier, Record<BillingDuration, number>> = {
  starter: { quarterly: 599, yearly: 1999 },
  pro: { quarterly: 1719, yearly: 5499 },
  elite: { quarterly: 7499, yearly: 24999 },
};

export const formatInr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function priceFor(tier: SubscriptionTier, duration: BillingDuration) {
  const total = PLAN_PRICES[tier][duration];
  return { total, perMonth: Math.round(total / BILLING_MONTHS[duration]) };
}

/** Whole-percent saving of a year on the yearly plan vs four quarters. */
export function yearlySavingsPct(tier: SubscriptionTier) {
  const quarters = PLAN_PRICES[tier].quarterly * 4;
  return Math.max(0, Math.round(((quarters - PLAN_PRICES[tier].yearly) / quarters) * 100));
}

/**
 * Free trial length. Trials only come with yearly plans, so a trial that
 * converts commits to a full year; quarterly is paid from day one. Each
 * trial must also exist as a free-trial offer on that yearly base plan in
 * Play Console, or the paywall promises something Google won't apply.
 */
export const YEARLY_TRIAL_DAYS: Record<SubscriptionTier, number> = {
  starter: 7,
  pro: 7,
  elite: 7,
};

export function trialDaysFor(tier: SubscriptionTier, duration: BillingDuration) {
  return duration === "yearly" ? YEARLY_TRIAL_DAYS[tier] : 0;
}
